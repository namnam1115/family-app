-- ============================================================
-- 028_schedule_reactions.sql  予定へのアイコン（スタンプ）反応
-- ============================================================

CREATE TABLE IF NOT EXISTS schedule_event_reactions (
  id          bigserial PRIMARY KEY,
  event_id    uuid NOT NULL REFERENCES schedule_events(id) ON DELETE CASCADE,
  family_id   uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  member_id   uuid REFERENCES family_members(id) ON DELETE SET NULL,
  member_name text,
  emoji       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- 1メンバー・1絵文字につき1つ（トグル）
  UNIQUE (event_id, member_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_schedule_event_reactions_event
  ON schedule_event_reactions (event_id);

ALTER TABLE schedule_event_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "家族メンバーは反応を参照可能" ON schedule_event_reactions
  FOR SELECT TO authenticated
  USING (family_id = get_my_family_id());

CREATE POLICY "家族メンバーは反応を追加可能" ON schedule_event_reactions
  FOR INSERT TO authenticated
  WITH CHECK (family_id = get_my_family_id());

CREATE POLICY "家族メンバーは反応を削除可能" ON schedule_event_reactions
  FOR DELETE TO authenticated
  USING (family_id = get_my_family_id());

ALTER PUBLICATION supabase_realtime ADD TABLE schedule_event_reactions;
