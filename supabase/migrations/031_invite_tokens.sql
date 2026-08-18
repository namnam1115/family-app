-- 招待を「家族 ID そのもの」から使い捨ての招待トークンへ移行する
--
-- 004 で families の SELECT を認証済み全員に開放したため、
-- 「招待リンクの UUID は推測困難」という前提が同じポリシーで崩れていた
-- （select id from families で全家族を列挙できる）。さらに family_members の
-- INSERT は user_id しか検証していなかったため、未所属ユーザーは列挙した
-- family_id を指定して任意の家族に参加し、その家族の全データを閲覧できた。
--
-- ここでは families の SELECT を自分の家族に戻し、家族の作成・参加は
-- security definer の RPC 経由のみに限定する。

-- ── 招待トークン ─────────────────────────────────────────
create table if not exists family_invites (
  token      text primary key,
  family_id  uuid not null references families(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  revoked_at timestamptz
);

create index if not exists family_invites_family_idx on family_invites(family_id);

alter table family_invites enable row level security;

-- 招待の一覧・失効は、その家族のメンバーだけが行える
-- （参加する側は未所属で family_id を持たないため、下の RPC 経由で解決する）
create policy "家族の招待を参照" on family_invites
  for select to authenticated using (family_id = get_my_family_id());

create policy "家族の招待を失効" on family_invites
  for update to authenticated
  using (family_id = get_my_family_id())
  with check (family_id = get_my_family_id());

-- ── RPC: 家族の作成（作成者を最初のメンバーとして登録） ──
create or replace function create_family_with_owner(p_name text, p_member_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user   uuid := auth.uid();
  v_family uuid;
begin
  if v_user is null then
    raise exception 'ログインが必要です';
  end if;
  if p_name is null or btrim(p_name) = '' then
    raise exception 'グループ名を入力してください';
  end if;
  if exists (select 1 from family_members where user_id = v_user) then
    raise exception 'すでに家族グループに参加しています';
  end if;

  insert into families (name) values (btrim(p_name)) returning id into v_family;
  insert into family_members (family_id, user_id, name, email)
  values (
    v_family, v_user,
    coalesce(nullif(btrim(coalesce(p_member_name, '')), ''), auth.jwt() ->> 'email'),
    auth.jwt() ->> 'email'
  );
  return v_family;
end;
$$;

-- ── RPC: 招待トークンの発行（有効な招待があれば使い回す） ──
create or replace function create_family_invite()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_family uuid := get_my_family_id();
  v_token  text;
begin
  if v_family is null then
    raise exception '家族グループに所属していません';
  end if;

  select token into v_token
    from family_invites
   where family_id = v_family and revoked_at is null and expires_at > now()
   order by created_at desc
   limit 1;
  if v_token is not null then
    return v_token;
  end if;

  -- pgcrypto に依存せず 244 ビット相当の乱数を作る
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into family_invites (token, family_id, created_by)
  values (v_token, v_family, auth.uid());
  return v_token;
end;
$$;

-- ── RPC: 招待トークンから家族情報を引く（参加前の確認用） ──
create or replace function get_family_invite(p_token text)
returns table (family_id uuid, family_name text)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select f.id, f.name
    from family_invites i
    join families f on f.id = i.family_id
   where i.token = p_token
     and i.revoked_at is null
     and i.expires_at > now();
$$;

-- ── RPC: 招待トークンで家族に参加する ────────────────────
create or replace function join_family_with_invite(p_token text, p_member_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user   uuid := auth.uid();
  v_family uuid;
begin
  if v_user is null then
    raise exception 'ログインが必要です';
  end if;
  if exists (select 1 from family_members where user_id = v_user) then
    raise exception 'すでに家族グループに参加しています';
  end if;

  select i.family_id into v_family
    from family_invites i
   where i.token = p_token
     and i.revoked_at is null
     and i.expires_at > now();
  if v_family is null then
    raise exception '招待リンクが無効か、有効期限が切れています';
  end if;

  insert into family_members (family_id, user_id, name, email)
  values (
    v_family, v_user,
    coalesce(nullif(btrim(coalesce(p_member_name, '')), ''), auth.jwt() ->> 'email'),
    auth.jwt() ->> 'email'
  );
  return v_family;
end;
$$;

revoke all on function create_family_with_owner(text, text) from public;
revoke all on function create_family_invite() from public;
revoke all on function get_family_invite(text) from public;
revoke all on function join_family_with_invite(text, text) from public;

grant execute on function create_family_with_owner(text, text) to authenticated;
grant execute on function create_family_invite() to authenticated;
grant execute on function get_family_invite(text) to authenticated;
grant execute on function join_family_with_invite(text, text) to authenticated;

-- ── ポリシーの引き締め ───────────────────────────────────
-- families: 全件参照をやめ、自分の家族のみに戻す
drop policy if exists "認証済みユーザーは家族グループを参照可能" on families;
drop policy if exists "自分の家族グループを参照" on families;
create policy "自分の家族グループを参照" on families
  for select to authenticated using (id = get_my_family_id());

-- 家族の作成・メンバー追加はいずれも RPC 経由のみ（直接 INSERT を廃止）
drop policy if exists "家族グループを作成" on families;
drop policy if exists "家族メンバーを追加" on family_members;
