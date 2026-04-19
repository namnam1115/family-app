CREATE TABLE inventory_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name        text NOT NULL,
  quantity    numeric NOT NULL DEFAULT 0,
  unit        text NOT NULL DEFAULT '個',
  category    text NOT NULL DEFAULT 'other',
  note        text,
  updated_by  text,
  updated_at  timestamptz DEFAULT now(),
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX inventory_items_family_id_idx ON inventory_items(family_id);

ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "family members can manage inventory"
  ON inventory_items FOR ALL
  USING (family_id = get_my_family_id())
  WITH CHECK (family_id = get_my_family_id());
