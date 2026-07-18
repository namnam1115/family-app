-- wish_places にタグ（自由なキーワード検索用）を追加
alter table wish_places
  add column if not exists tags text[] not null default '{}';

-- タグの部分一致・contains 検索を高速化
create index if not exists wish_places_tags_gin_idx on wish_places using gin (tags);
