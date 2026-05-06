-- Travel trips and activities tables for recording family trips and activities

-- travel_trips: 旅行の基本情報
CREATE TABLE travel_trips (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id         uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  title             text NOT NULL,
  start_date        date NOT NULL,
  end_date          date NOT NULL,
  memo              text,
  schedule_event_id uuid,
  created_by        text,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- travel_activities: 旅行内の活動記録
CREATE TABLE travel_activities (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     uuid NOT NULL REFERENCES travel_trips(id) ON DELETE CASCADE,
  family_id   uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  order_index integer NOT NULL DEFAULT 0,
  title       text NOT NULL,
  memo        text,
  created_at  timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE travel_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE travel_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "family members can manage trips"
  ON travel_trips FOR ALL
  USING (family_id = get_my_family_id())
  WITH CHECK (family_id = get_my_family_id());

CREATE POLICY "family members can manage activities"
  ON travel_activities FOR ALL
  USING (family_id = get_my_family_id())
  WITH CHECK (family_id = get_my_family_id());

-- Indexes
CREATE INDEX travel_trips_family_id_idx ON travel_trips(family_id);
CREATE INDEX travel_trips_start_date_idx ON travel_trips(family_id, start_date DESC);
CREATE INDEX travel_activities_trip_id_idx ON travel_activities(trip_id);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE travel_trips;
ALTER PUBLICATION supabase_realtime ADD TABLE travel_activities;
