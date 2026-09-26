-- 価格比較: 内容量（数量 + 単位）を記録し、サイズ違いの商品を単価で比較できるようにする
ALTER TABLE price_items ADD COLUMN IF NOT EXISTS quantity numeric(10, 2) CHECK (quantity IS NULL OR quantity > 0);
ALTER TABLE price_items ADD COLUMN IF NOT EXISTS unit text;
