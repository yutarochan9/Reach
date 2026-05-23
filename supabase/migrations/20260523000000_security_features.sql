-- セキュリティ機能 DB整備

-- 管理者フラグ
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false NOT NULL;

-- 通知設定（詳細JSONB）
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notification_settings jsonb DEFAULT '{
  "messages": true,
  "reactions": true,
  "follows": true,
  "show_preview": true,
  "quiet_hours_enabled": false,
  "quiet_hours_start": "22:00",
  "quiet_hours_end": "08:00"
}'::jsonb;

-- 報告テーブル
CREATE TABLE IF NOT EXISTS reports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  reported_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  reported_broadcast_id uuid REFERENCES broadcasts(id) ON DELETE SET NULL,
  reason text NOT NULL,
  details text,
  status text DEFAULT 'pending' NOT NULL,
  admin_note text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT reports_has_target CHECK (
    reported_user_id IS NOT NULL OR reported_broadcast_id IS NOT NULL
  )
);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can create reports" ON reports
  FOR INSERT WITH CHECK (auth.uid() = reporter_id);

CREATE POLICY "users can see own reports" ON reports
  FOR SELECT USING (auth.uid() = reporter_id);

CREATE POLICY "admins can manage reports" ON reports
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- リカバリーコード（端末移行・TOTP紛失時）
CREATE TABLE IF NOT EXISTS recovery_codes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  code_hash text NOT NULL,
  used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE recovery_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own recovery codes" ON recovery_codes
  FOR ALL USING (auth.uid() = user_id);

-- フィーチャーフラグ（お試し・ステージング用）
CREATE TABLE IF NOT EXISTS feature_flags (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  key text UNIQUE NOT NULL,
  enabled boolean DEFAULT false NOT NULL,
  description text,
  target_user_ids uuid[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "all users can read feature flags" ON feature_flags
  FOR SELECT USING (true);

CREATE POLICY "admins can manage feature flags" ON feature_flags
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- 初期フィーチャーフラグ
INSERT INTO feature_flags (key, enabled, description) VALUES
  ('new_ui', false, '新UIデザイン'),
  ('rich_menu_v2', false, 'リッチメニュー v2'),
  ('analytics_dashboard', false, 'アナリティクスダッシュボード')
ON CONFLICT (key) DO NOTHING;

-- username 'Reach' を管理者に
UPDATE profiles SET is_admin = true WHERE username = 'Reach';
