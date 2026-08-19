-- 旅行を「計画（準備）→ 実行（記録）」まで一つにまとめるための拡張

-- 旅行の計画要素
ALTER TABLE travel_trips ADD COLUMN IF NOT EXISTS budget      numeric(10,2);
ALTER TABLE travel_trips ADD COLUMN IF NOT EXISTS companions  text;
ALTER TABLE travel_trips ADD COLUMN IF NOT EXISTS transport   text;
ALTER TABLE travel_trips ADD COLUMN IF NOT EXISTS lodging     text;

-- 行程（何日目・時刻・場所・費用・実施済み）
-- start_time は <input type="time"> と往復させるだけの表示用なので 'HH:MM' の text で持つ
ALTER TABLE travel_activities ADD COLUMN IF NOT EXISTS day_index  integer NOT NULL DEFAULT 0;
ALTER TABLE travel_activities ADD COLUMN IF NOT EXISTS start_time text;
ALTER TABLE travel_activities ADD COLUMN IF NOT EXISTS place      text;
ALTER TABLE travel_activities ADD COLUMN IF NOT EXISTS cost       numeric(10,2);
ALTER TABLE travel_activities ADD COLUMN IF NOT EXISTS done       boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS travel_activities_trip_order_idx
  ON travel_activities(trip_id, day_index, order_index);

-- 準備リスト（持ち物 packing / やること todo）
CREATE TABLE IF NOT EXISTS travel_prep_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     uuid NOT NULL REFERENCES travel_trips(id) ON DELETE CASCADE,
  family_id   uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  category    text NOT NULL DEFAULT 'packing',
  title       text NOT NULL,
  assignee    text,
  order_index integer NOT NULL DEFAULT 0,
  done        boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS travel_prep_items_family_id_idx ON travel_prep_items(family_id);
CREATE INDEX IF NOT EXISTS travel_prep_items_trip_idx ON travel_prep_items(trip_id, category, order_index);

ALTER TABLE travel_prep_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "family members can manage travel_prep_items"
  ON travel_prep_items FOR ALL TO authenticated
  USING (family_id = get_my_family_id())
  WITH CHECK (family_id = get_my_family_id());

ALTER PUBLICATION supabase_realtime ADD TABLE travel_prep_items;
