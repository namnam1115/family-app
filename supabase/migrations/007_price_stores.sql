-- 店舗マスタテーブル
CREATE TABLE IF NOT EXISTS price_stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE (family_id, name)
);

ALTER TABLE price_stores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "家族メンバーは店舗を参照可能" ON price_stores
  FOR SELECT TO authenticated USING (family_id = get_my_family_id());
CREATE POLICY "家族メンバーは店舗を追加可能" ON price_stores
  FOR INSERT TO authenticated WITH CHECK (family_id = get_my_family_id());
CREATE POLICY "家族メンバーは店舗を更新可能" ON price_stores
  FOR UPDATE TO authenticated USING (family_id = get_my_family_id());
CREATE POLICY "家族メンバーは店舗を削除可能" ON price_stores
  FOR DELETE TO authenticated USING (family_id = get_my_family_id());
