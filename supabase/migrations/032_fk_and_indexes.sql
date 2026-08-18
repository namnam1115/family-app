-- 旅行↔予定の参照整合性と、頻繁に引くカラムのインデックス

-- ── travel_trips.schedule_event_id に外部キーを付ける ────
-- 従来は制約のない uuid だったため、予定表側から旅行の予定を削除すると
-- 存在しない ID を指したまま残り、旅行を編集しても予定に反映されない
-- （0 行 UPDATE がエラーにならない）状態になっていた。
update travel_trips t
   set schedule_event_id = null
 where t.schedule_event_id is not null
   and not exists (select 1 from schedule_events e where e.id = t.schedule_event_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'travel_trips_schedule_event_id_fkey'
  ) then
    alter table travel_trips
      add constraint travel_trips_schedule_event_id_fkey
      foreign key (schedule_event_id) references schedule_events(id) on delete set null;
  end if;
end $$;

-- ── インデックス ─────────────────────────────────────────
-- Postgres は外部キーに自動でインデックスを張らない。
-- shopping_items.list_id は RLS のサブクエリでも毎回評価される。
create index if not exists shopping_items_list_id_idx on shopping_items(list_id);
create index if not exists shopping_lists_family_id_idx on shopping_lists(family_id);
create index if not exists family_members_family_id_idx on family_members(family_id);
create index if not exists dishes_family_id_idx on dishes(family_id);
create index if not exists dish_categories_family_id_idx on dish_categories(family_id);
create index if not exists price_items_family_id_idx on price_items(family_id);
create index if not exists price_stores_family_id_idx on price_stores(family_id);
create index if not exists push_subscriptions_family_id_idx on push_subscriptions(family_id);
