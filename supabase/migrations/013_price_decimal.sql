-- price_items.price を小数点2桁まで対応できるよう integer → numeric(10,2) に変更
ALTER TABLE price_items
  ALTER COLUMN price TYPE numeric(10, 2) USING price::numeric(10, 2);
