-- 公式アカウントフラグ
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_official boolean DEFAULT false NOT NULL;

-- Reach公式アカウントに付与
UPDATE profiles SET is_official = true WHERE username = 'Reach';
