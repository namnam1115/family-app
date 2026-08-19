-- 旅行の同行者を家族メンバーから選べるようにする
-- 配列には外部キーを張れないため、メンバーが家族を抜けた場合は
-- 表示側（family_members との突き合わせ）で解決できない ID を無視する。
-- 家族以外の同行者（祖母・友人など）は従来どおり companions テキストに残す。

ALTER TABLE travel_trips
  ADD COLUMN IF NOT EXISTS companion_member_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];
