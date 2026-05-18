-- SNSリンク用カラム追加
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sns_links JSONB DEFAULT '{}';

-- ユーザーID（username）にUNIQUE制約追加
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique
  ON profiles (username)
  WHERE username IS NOT NULL;
