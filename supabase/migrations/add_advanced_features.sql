-- =============================================
-- 高度機能: タグ・ステップ配信・自動応答・リッチメニュー
-- =============================================

-- フォロワーへのタグ付け（セグメント配信用）
CREATE TABLE IF NOT EXISTS follower_tags (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  follower_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  tag text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(creator_id, follower_id, tag)
);
CREATE INDEX IF NOT EXISTS follower_tags_creator_idx ON follower_tags(creator_id);

-- ステップ配信シーケンス
CREATE TABLE IF NOT EXISTS step_sequences (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS step_sequences_creator_idx ON step_sequences(creator_id);

-- ステップ配信メッセージ（何日目に何を送るか）
CREATE TABLE IF NOT EXISTS step_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sequence_id uuid REFERENCES step_sequences(id) ON DELETE CASCADE,
  day_offset integer NOT NULL DEFAULT 0,
  content text NOT NULL,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS step_messages_seq_idx ON step_messages(sequence_id, day_offset);

-- ステップ配信エンロールメント（誰がどのシーケンスに登録されているか）
CREATE TABLE IF NOT EXISTS step_enrollments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  follower_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  creator_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  sequence_id uuid REFERENCES step_sequences(id) ON DELETE CASCADE,
  enrolled_at timestamptz DEFAULT now(),
  completed boolean DEFAULT false,
  UNIQUE(follower_id, sequence_id)
);
CREATE INDEX IF NOT EXISTS step_enrollments_seq_idx ON step_enrollments(sequence_id, enrolled_at);

-- 自動応答ルール
CREATE TABLE IF NOT EXISTS auto_responses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  keyword text NOT NULL,
  response_text text NOT NULL,
  is_active boolean DEFAULT true,
  match_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auto_responses_creator_idx ON auto_responses(creator_id);

-- リッチメニュー
CREATE TABLE IF NOT EXISTS rich_menus (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id uuid REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  buttons jsonb NOT NULL DEFAULT '[]',
  is_active boolean DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE follower_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE step_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE step_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE step_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE rich_menus ENABLE ROW LEVEL SECURITY;

-- follower_tags: クリエイターが自分のフォロワーに付けたタグを管理
CREATE POLICY "creator manages own follower tags" ON follower_tags
  FOR ALL USING (auth.uid() = creator_id);
CREATE POLICY "follower sees own tags" ON follower_tags
  FOR SELECT USING (auth.uid() = follower_id);

-- step_sequences: クリエイターが管理
CREATE POLICY "creator manages sequences" ON step_sequences
  FOR ALL USING (auth.uid() = creator_id);

-- step_messages: シーケンスのオーナーが管理
CREATE POLICY "creator manages step messages" ON step_messages
  FOR ALL USING (
    auth.uid() = (SELECT creator_id FROM step_sequences WHERE id = sequence_id)
  );

-- step_enrollments: クリエイターと本人が参照
CREATE POLICY "creator sees enrollments" ON step_enrollments
  FOR SELECT USING (auth.uid() = creator_id);
CREATE POLICY "system inserts enrollments" ON step_enrollments
  FOR INSERT WITH CHECK (true);

-- auto_responses: クリエイターが管理、誰でも参照可
CREATE POLICY "creator manages auto_responses" ON auto_responses
  FOR ALL USING (auth.uid() = creator_id);
CREATE POLICY "anyone reads active auto_responses" ON auto_responses
  FOR SELECT USING (is_active = true);

-- rich_menus: クリエイターが管理、誰でも参照可
CREATE POLICY "creator manages rich_menu" ON rich_menus
  FOR ALL USING (auth.uid() = creator_id);
CREATE POLICY "anyone reads active rich_menus" ON rich_menus
  FOR SELECT USING (is_active = true);
