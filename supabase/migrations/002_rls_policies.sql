-- Row Level Security を有効化
alter table families enable row level security;
alter table family_members enable row level security;
alter table shopping_lists enable row level security;
alter table shopping_items enable row level security;

-- ヘルパー関数: 現在ユーザーの family_id を返す
create or replace function get_my_family_id()
returns uuid
language sql
security definer
stable
as $$
  select family_id from family_members where user_id = auth.uid() limit 1;
$$;

-- families: 自分の所属グループのみ参照・更新可能
create policy "自分の家族グループを参照" on families
  for select using (id = get_my_family_id());

create policy "家族グループを作成" on families
  for insert with check (true);

-- family_members: 同じ家族のメンバーを参照可能
create policy "家族メンバーを参照" on family_members
  for select using (family_id = get_my_family_id());

create policy "家族メンバーを追加" on family_members
  for insert with check (user_id = auth.uid());

-- shopping_lists: 同じ家族のリストのみ操作可能
create policy "家族の買い物リストを参照" on shopping_lists
  for select using (family_id = get_my_family_id());

create policy "家族の買い物リストを作成" on shopping_lists
  for insert with check (family_id = get_my_family_id());

create policy "家族の買い物リストを削除" on shopping_lists
  for delete using (family_id = get_my_family_id());

-- shopping_items: 同じ家族のリストのアイテムのみ操作可能
create policy "家族の買い物アイテムを参照" on shopping_items
  for select using (
    list_id in (select id from shopping_lists where family_id = get_my_family_id())
  );

create policy "家族の買い物アイテムを作成" on shopping_items
  for insert with check (
    list_id in (select id from shopping_lists where family_id = get_my_family_id())
  );

create policy "家族の買い物アイテムを更新" on shopping_items
  for update using (
    list_id in (select id from shopping_lists where family_id = get_my_family_id())
  );

create policy "家族の買い物アイテムを削除" on shopping_items
  for delete using (
    list_id in (select id from shopping_lists where family_id = get_my_family_id())
  );
