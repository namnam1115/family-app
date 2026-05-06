-- Add prefecture column to travel_trips for location filtering and search
ALTER TABLE travel_trips
  ADD COLUMN IF NOT EXISTS prefecture text;

-- Create index for prefecture-based filtering
CREATE INDEX IF NOT EXISTS travel_trips_prefecture_idx ON travel_trips(family_id, prefecture);
