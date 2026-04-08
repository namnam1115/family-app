-- ============================================================
-- 012_schedule_history.sql  スケジュール変更履歴
-- ============================================================

CREATE TABLE IF NOT EXISTS schedule_event_history (
  id              bigserial PRIMARY KEY,
  event_id        uuid NOT NULL REFERENCES schedule_events(id) ON DELETE CASCADE,
  family_id       uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  changed_by      uuid REFERENCES family_members(id) ON DELETE SET NULL,
  changed_by_name text,
  action          text NOT NULL CHECK (action IN ('created', 'updated')),
  snapshot        jsonb NOT NULL,
  changed_at      timestamptz NOT NULL DEFAULT now()
);

-- イベントIDと日時で高速検索できるようにインデックスを作成
CREATE INDEX idx_schedule_event_history_event
  ON schedule_event_history (event_id, changed_at DESC);

ALTER TABLE schedule_event_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "家族メンバーは変更履歴を参照可能" ON schedule_event_history
  FOR SELECT TO authenticated
  USING (family_id = get_my_family_id());

CREATE POLICY "家族メンバーは変更履歴を追加可能" ON schedule_event_history
  FOR INSERT TO authenticated
  WITH CHECK (family_id = get_my_family_id());
