-- 宿泊先の Google マップ連携（住所・座標）と、1 人あたり費用の算出に使う参加人数

ALTER TABLE travel_trips
  ADD COLUMN IF NOT EXISTS lodging_address text,
  ADD COLUMN IF NOT EXISTS lodging_lat     double precision,
  ADD COLUMN IF NOT EXISTS lodging_lng     double precision,
  -- 未入力なら同行者に選んだメンバー数を使う（家族以外が同行するときの上書き用）
  ADD COLUMN IF NOT EXISTS party_size      integer CHECK (party_size IS NULL OR party_size > 0);
