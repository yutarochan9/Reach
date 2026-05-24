-- 新規フォロワーへの過去配信表示設定
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS past_broadcasts_visible boolean NOT NULL DEFAULT true;
