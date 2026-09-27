-- 家族間のお金の貸し借り（誰が誰にいつ、いくら貸したか）と、その返済記録

CREATE TABLE IF NOT EXISTS loans (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id    uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  -- メンバーが家族を抜けても記録は残す（画面では「退会したメンバー」と表示）
  lender_id    uuid REFERENCES family_members(id) ON DELETE SET NULL,
  borrower_id  uuid REFERENCES family_members(id) ON DELETE SET NULL,
  amount       numeric(12,0) NOT NULL CHECK (amount > 0),
  borrowed_on  date NOT NULL DEFAULT current_date,
  memo         text,
  created_by   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (lender_id IS NULL OR borrower_id IS NULL OR lender_id <> borrower_id)
);

CREATE INDEX IF NOT EXISTS loans_family_borrowed_on_idx ON loans(family_id, borrowed_on DESC);

-- 分割での返済に対応するため、返済は 1 回ごとに記録する
CREATE TABLE IF NOT EXISTS loan_repayments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id     uuid NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  family_id   uuid NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  amount      numeric(12,0) NOT NULL CHECK (amount > 0),
  repaid_on   date NOT NULL DEFAULT current_date,
  memo        text,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS loan_repayments_loan_id_idx ON loan_repayments(loan_id);
CREATE INDEX IF NOT EXISTS loan_repayments_family_id_idx ON loan_repayments(family_id);

ALTER TABLE loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_repayments ENABLE ROW LEVEL SECURITY;

-- 外部キーの検査は RLS を通らないため、他家族のメンバー・貸し借りを参照できないよう WITH CHECK で確かめる
DROP POLICY IF EXISTS "family members can manage loans" ON loans;
CREATE POLICY "family members can manage loans"
  ON loans FOR ALL TO authenticated
  USING (family_id = get_my_family_id())
  WITH CHECK (
    family_id = get_my_family_id()
    AND (lender_id IS NULL OR EXISTS (
      SELECT 1 FROM family_members m WHERE m.id = lender_id AND m.family_id = get_my_family_id()
    ))
    AND (borrower_id IS NULL OR EXISTS (
      SELECT 1 FROM family_members m WHERE m.id = borrower_id AND m.family_id = get_my_family_id()
    ))
  );

DROP POLICY IF EXISTS "family members can manage loan_repayments" ON loan_repayments;
CREATE POLICY "family members can manage loan_repayments"
  ON loan_repayments FOR ALL TO authenticated
  USING (family_id = get_my_family_id())
  WITH CHECK (
    family_id = get_my_family_id()
    AND EXISTS (SELECT 1 FROM loans l WHERE l.id = loan_id AND l.family_id = get_my_family_id())
  );

ALTER PUBLICATION supabase_realtime ADD TABLE loans;
ALTER PUBLICATION supabase_realtime ADD TABLE loan_repayments;
