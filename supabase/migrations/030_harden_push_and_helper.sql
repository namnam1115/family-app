-- プッシュ購読の家族検証と、RLS ヘルパー関数の search_path 固定
--
-- 1) push_subscriptions の WITH CHECK が user_id しか見ていなかったため、
--    他家族の family_id で自分の端末を登録すると、その家族向けのプッシュ
--    （予定タイトル・買い物アイテム名）を受信できてしまっていた。
-- 2) get_my_family_id() は security definer だが search_path が未固定だった。

-- ── 1) push_subscriptions ────────────────────────────────
drop policy if exists "自分のサブスクリプションを管理" on push_subscriptions;

-- USING は user_id のみ（家族が変わっても自分の古い購読を削除できるようにする）
-- WITH CHECK で登録・更新時に「自分の家族」であることを強制する
create policy "自分のサブスクリプションを管理" on push_subscriptions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and family_id = get_my_family_id());

-- ── 2) get_my_family_id() ────────────────────────────────
create or replace function get_my_family_id()
returns uuid
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select family_id from family_members where user_id = auth.uid() limit 1;
$$;

-- ── 3) 既に混入している家族外の購読を削除 ────────────────
-- 所有者の所属家族と一致しない購読行は、上のポリシー導入前にしか作れず、
-- 定義上すべて不正（他家族の通知を受け取る状態）なので削除する。
-- 正規の利用者に影響が出た場合でも、通知設定を開き直せば再登録される。
delete from push_subscriptions ps
where not exists (
  select 1 from family_members fm
  where fm.user_id = ps.user_id and fm.family_id = ps.family_id
);
