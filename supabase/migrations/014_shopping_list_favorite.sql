-- shopping_lists にお気に入りフラグを追加
alter table shopping_lists
  add column if not exists is_favorite boolean not null default false;

-- shopping_lists の update ポリシーを追加（is_favorite 等の更新に必要）
create policy "家族の買い物リストを更新" on shopping_lists
  for update using (family_id = get_my_family_id());
