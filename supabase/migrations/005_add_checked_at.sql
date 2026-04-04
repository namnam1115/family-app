-- 購入日時カラムを追加
ALTER TABLE shopping_items ADD COLUMN IF NOT EXISTS checked_at timestamp with time zone;
