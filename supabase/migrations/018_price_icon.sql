-- 価格比較の商品アイコン列を追加
ALTER TABLE price_items ADD COLUMN IF NOT EXISTS icon text;
