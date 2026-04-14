-- wish_places に緯度・経度カラムを追加
alter table wish_places
  add column if not exists lat double precision,
  add column if not exists lng double precision;
