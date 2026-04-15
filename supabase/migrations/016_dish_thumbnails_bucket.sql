-- dish-thumbnails storage bucket
-- TikTokのサムネイルURLは署名付きで期限切れになるため、
-- 画像をダウンロードしてここに永続保存する

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dish-thumbnails',
  'dish-thumbnails',
  true,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- 誰でも読める（公開バケット）
CREATE POLICY "Public read dish-thumbnails"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'dish-thumbnails');

-- service_role（Edge Function）のみ書き込み可
-- service_role は RLS をバイパスするため追加ポリシーは不要だが、
-- authenticated ユーザーからの直接アップロードは禁止する
