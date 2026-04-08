-- ============================================================
-- 011_shift_mode.sql  勤務シフト列追加
-- 010_schedule.sql が既に適用済みの場合はこちらを実行
-- ============================================================
ALTER TABLE schedule_events
  ADD COLUMN IF NOT EXISTS shift_type text
  CHECK (shift_type IN ('日勤', '夜勤', '明け', '休み'));
