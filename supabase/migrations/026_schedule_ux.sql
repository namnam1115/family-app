-- ============================================================
-- 026_schedule_ux.sql  スケジュール UX 強化
--   繰り返しの例外日 / コメント既読管理
-- ============================================================

-- 繰り返し予定の「この回だけ削除」用の除外日リスト（#3 例外日）
ALTER TABLE schedule_events
  ADD COLUMN IF NOT EXISTS recurrence_exceptions date[] NOT NULL DEFAULT '{}';

-- コメント既読管理（未読バッジ #2 用）
CREATE TABLE IF NOT EXISTS schedule_event_reads (
  event_id     uuid NOT NULL REFERENCES schedule_events(id) ON DELETE CASCADE,
  member_id    uuid NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  family_id    uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, member_id)
);

ALTER TABLE schedule_event_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "家族メンバーは既読を参照可能" ON schedule_event_reads
  FOR SELECT TO authenticated
  USING (family_id = get_my_family_id());

CREATE POLICY "家族メンバーは既読を登録更新可能" ON schedule_event_reads
  FOR ALL TO authenticated
  USING (family_id = get_my_family_id())
  WITH CHECK (family_id = get_my_family_id());
