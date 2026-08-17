-- ============================================================
-- 025_schedule_comments.sql  予定へのコメント（家族間コミュニケーション）
-- ============================================================

CREATE TABLE IF NOT EXISTS schedule_event_comments (
  id          bigserial PRIMARY KEY,
  event_id    uuid NOT NULL REFERENCES schedule_events(id) ON DELETE CASCADE,
  family_id   uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  member_id   uuid REFERENCES family_members(id) ON DELETE SET NULL,
  member_name text,
  body        text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schedule_event_comments_event
  ON schedule_event_comments (event_id, created_at ASC);

ALTER TABLE schedule_event_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "家族メンバーはコメントを参照可能" ON schedule_event_comments
  FOR SELECT TO authenticated
  USING (family_id = get_my_family_id());

CREATE POLICY "家族メンバーはコメントを追加可能" ON schedule_event_comments
  FOR INSERT TO authenticated
  WITH CHECK (family_id = get_my_family_id());

CREATE POLICY "家族メンバーはコメントを削除可能" ON schedule_event_comments
  FOR DELETE TO authenticated
  USING (family_id = get_my_family_id());

ALTER PUBLICATION supabase_realtime ADD TABLE schedule_event_comments;
