-- families の SELECT ポリシーを修正
-- 招待リンク経由で参加する際、未所属ユーザーも family_id で検索できる必要がある
-- UUID は推測困難なため、認証済みユーザー全員に SELECT を許可しても安全

drop policy if exists "自分の家族グループを参照" on families;

create policy "認証済みユーザーは家族グループを参照可能" on families
  for select to authenticated using (true);
