-- 食べたいおかずカテゴリテーブル
CREATE TABLE IF NOT EXISTS dish_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id  uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name       text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (family_id, name)
);

ALTER TABLE dish_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "家族メンバーはカテゴリを参照可能" ON dish_categories
  FOR SELECT TO authenticated
  USING (family_id = get_my_family_id());

CREATE POLICY "家族メンバーはカテゴリを追加可能" ON dish_categories
  FOR INSERT TO authenticated
  WITH CHECK (family_id = get_my_family_id());

CREATE POLICY "家族メンバーはカテゴリを更新可能" ON dish_categories
  FOR UPDATE TO authenticated
  USING (family_id = get_my_family_id());

CREATE POLICY "家族メンバーはカテゴリを削除可能" ON dish_categories
  FOR DELETE TO authenticated
  USING (family_id = get_my_family_id());

-- 食べたいおかずテーブル
CREATE TABLE IF NOT EXISTS dishes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name        text NOT NULL,
  category_id uuid REFERENCES dish_categories(id) ON DELETE SET NULL,
  url         text,
  image_url   text,
  added_by    uuid REFERENCES family_members(id) ON DELETE SET NULL,
  cooked_at   timestamp with time zone,
  rating      smallint CHECK (rating BETWEEN 1 AND 5),
  review      text,
  created_at  timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE dishes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "家族メンバーは料理を参照可能" ON dishes
  FOR SELECT TO authenticated
  USING (family_id = get_my_family_id());

CREATE POLICY "家族メンバーは料理を追加可能" ON dishes
  FOR INSERT TO authenticated
  WITH CHECK (family_id = get_my_family_id());

CREATE POLICY "家族メンバーは料理を更新可能" ON dishes
  FOR UPDATE TO authenticated
  USING (family_id = get_my_family_id());

CREATE POLICY "家族メンバーは料理を削除可能" ON dishes
  FOR DELETE TO authenticated
  USING (family_id = get_my_family_id());

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE dish_categories;
ALTER PUBLICATION supabase_realtime ADD TABLE dishes;
