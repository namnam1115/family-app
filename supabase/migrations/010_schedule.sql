-- ============================================================
-- 010_schedule.sql  家族スケジュール機能
-- ============================================================

CREATE TABLE IF NOT EXISTS schedule_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id      uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  title          text NOT NULL,
  memo           text,
  all_day        boolean NOT NULL DEFAULT true,
  start_date     date,
  end_date       date,
  start_datetime timestamp with time zone,
  end_datetime   timestamp with time zone,
  member_id      uuid REFERENCES family_members(id) ON DELETE SET NULL,
  created_at     timestamp with time zone NOT NULL DEFAULT now(),
  updated_at     timestamp with time zone NOT NULL DEFAULT now(),

  CONSTRAINT check_event_type CHECK (
    (all_day = true  AND start_date IS NOT NULL) OR
    (all_day = false AND start_datetime IS NOT NULL AND end_datetime IS NOT NULL)
  )
);

ALTER TABLE schedule_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "家族メンバーはイベントを参照可能" ON schedule_events
  FOR SELECT TO authenticated
  USING (family_id = get_my_family_id());

CREATE POLICY "家族メンバーはイベントを追加可能" ON schedule_events
  FOR INSERT TO authenticated
  WITH CHECK (family_id = get_my_family_id());

CREATE POLICY "家族メンバーはイベントを更新可能" ON schedule_events
  FOR UPDATE TO authenticated
  USING (family_id = get_my_family_id());

CREATE POLICY "家族メンバーはイベントを削除可能" ON schedule_events
  FOR DELETE TO authenticated
  USING (family_id = get_my_family_id());

CREATE OR REPLACE FUNCTION update_schedule_events_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER schedule_events_updated_at
  BEFORE UPDATE ON schedule_events
  FOR EACH ROW EXECUTE FUNCTION update_schedule_events_updated_at();

CREATE INDEX IF NOT EXISTS idx_schedule_events_family_start
  ON schedule_events (family_id, start_date, start_datetime);

ALTER PUBLICATION supabase_realtime ADD TABLE schedule_events;
