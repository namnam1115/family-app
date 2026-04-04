-- 価格比較テーブル
CREATE TABLE IF NOT EXISTS price_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  store_name text NOT NULL,
  product_name text NOT NULL,
  price integer NOT NULL CHECK (price >= 0),
  note text,
  updated_by text NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (family_id, store_name, product_name)
);

ALTER TABLE price_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "家族メンバーは価格を参照可能" ON price_items
  FOR SELECT TO authenticated
  USING (family_id = get_my_family_id());

CREATE POLICY "家族メンバーは価格を追加可能" ON price_items
  FOR INSERT TO authenticated
  WITH CHECK (family_id = get_my_family_id());

CREATE POLICY "家族メンバーは価格を更新可能" ON price_items
  FOR UPDATE TO authenticated
  USING (family_id = get_my_family_id());

CREATE POLICY "家族メンバーは価格を削除可能" ON price_items
  FOR DELETE TO authenticated
  USING (family_id = get_my_family_id());
