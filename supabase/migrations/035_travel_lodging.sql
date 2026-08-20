-- 宿泊先の Google マップ連携（住所・座標）

ALTER TABLE travel_trips
  ADD COLUMN IF NOT EXISTS lodging_address text,
  ADD COLUMN IF NOT EXISTS lodging_lat     double precision,
  ADD COLUMN IF NOT EXISTS lodging_lng     double precision;
