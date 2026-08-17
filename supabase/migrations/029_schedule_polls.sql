-- ============================================================
-- 029_schedule_polls.sql  日程調整（出欠調整）
--   候補日を出し合い、⭕🤔❌ で回答→集計→予定に確定
-- ============================================================

CREATE TABLE IF NOT EXISTS schedule_polls (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id          uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  title              text NOT NULL,
  memo               text,
  created_by         uuid REFERENCES family_members(id) ON DELETE SET NULL,
  created_by_name    text,
  status             text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  confirmed_event_id uuid REFERENCES schedule_events(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS schedule_poll_candidates (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id        uuid NOT NULL REFERENCES schedule_polls(id) ON DELETE CASCADE,
  family_id      uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  candidate_date date NOT NULL,
  candidate_time text,               -- 'HH:MM'（任意）。無ければ終日として確定
  sort_order     integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS schedule_poll_votes (
  id           bigserial PRIMARY KEY,
  poll_id      uuid NOT NULL REFERENCES schedule_polls(id) ON DELETE CASCADE,
  candidate_id uuid NOT NULL REFERENCES schedule_poll_candidates(id) ON DELETE CASCADE,
  family_id    uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  member_id    uuid REFERENCES family_members(id) ON DELETE SET NULL,
  member_name  text,
  choice       text NOT NULL CHECK (choice IN ('ok', 'maybe', 'ng')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_poll_candidates_poll ON schedule_poll_candidates (poll_id);
CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON schedule_poll_votes (poll_id);

-- RLS：すべて家族スコープ
ALTER TABLE schedule_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_poll_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_poll_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "家族は日程調整を参照" ON schedule_polls
  FOR SELECT TO authenticated USING (family_id = get_my_family_id());
CREATE POLICY "家族は日程調整を追加" ON schedule_polls
  FOR INSERT TO authenticated WITH CHECK (family_id = get_my_family_id());
CREATE POLICY "家族は日程調整を更新" ON schedule_polls
  FOR UPDATE TO authenticated USING (family_id = get_my_family_id());
CREATE POLICY "家族は日程調整を削除" ON schedule_polls
  FOR DELETE TO authenticated USING (family_id = get_my_family_id());

CREATE POLICY "家族は候補日を参照" ON schedule_poll_candidates
  FOR SELECT TO authenticated USING (family_id = get_my_family_id());
CREATE POLICY "家族は候補日を追加" ON schedule_poll_candidates
  FOR INSERT TO authenticated WITH CHECK (family_id = get_my_family_id());
CREATE POLICY "家族は候補日を削除" ON schedule_poll_candidates
  FOR DELETE TO authenticated USING (family_id = get_my_family_id());

CREATE POLICY "家族は回答を参照" ON schedule_poll_votes
  FOR SELECT TO authenticated USING (family_id = get_my_family_id());
CREATE POLICY "家族は回答を追加" ON schedule_poll_votes
  FOR INSERT TO authenticated WITH CHECK (family_id = get_my_family_id());
CREATE POLICY "家族は回答を更新" ON schedule_poll_votes
  FOR UPDATE TO authenticated USING (family_id = get_my_family_id());
CREATE POLICY "家族は回答を削除" ON schedule_poll_votes
  FOR DELETE TO authenticated USING (family_id = get_my_family_id());

ALTER PUBLICATION supabase_realtime ADD TABLE schedule_poll_votes;
ALTER PUBLICATION supabase_realtime ADD TABLE schedule_polls;
