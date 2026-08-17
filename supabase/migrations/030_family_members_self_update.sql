-- family_members: 本人の行のみ更新可能に（name/email の自動補完に必要。従来 UPDATE ポリシーが無く更新不可だった）
drop policy if exists "自分のメンバー情報を更新" on family_members;

create policy "自分のメンバー情報を更新" on family_members
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());
