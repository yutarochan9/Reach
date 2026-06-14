-- スポット機能 DB設計

-- スポット本体テーブル
CREATE TABLE IF NOT EXISTS spots (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title text,                                          -- タイトル（任意）
  status text DEFAULT 'open' NOT NULL,                 -- open | closed
  participation_type text DEFAULT 'followers' NOT NULL, -- followers | members | all
  comment_type text DEFAULT 'followers' NOT NULL,       -- followers | members（観覧は常に全員可）
  opened_at timestamptz DEFAULT now() NOT NULL,
  closed_at timestamptz,                               -- 手動終了 or 最長1時間で自動セット
  auto_close_at timestamptz                             -- opened_at + 1時間（トリガーで設定）
);

ALTER TABLE spots ENABLE ROW LEVEL SECURITY;

-- 誰でも open なスポットを閲覧可
CREATE POLICY "anyone can view open spots" ON spots
  FOR SELECT USING (status = 'open' OR auth.uid() = creator_id);

-- クリエイター本人のみ作成・更新（終了処理など）
CREATE POLICY "creator can insert spot" ON spots
  FOR INSERT WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "creator can update spot" ON spots
  FOR UPDATE USING (auth.uid() = creator_id);

-- スポットチャットメッセージ
CREATE TABLE IF NOT EXISTS spot_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  spot_id uuid REFERENCES spots(id) ON DELETE CASCADE NOT NULL,
  sender_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  content text NOT NULL,
  is_creator_message boolean DEFAULT false NOT NULL,   -- 配信者のメッセージかどうか
  deleted_at timestamptz,                              -- ソフトデリート（配信者が削除）
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE spot_messages ENABLE ROW LEVEL SECURITY;

-- メッセージ閲覧：open なスポットなら誰でも可
CREATE POLICY "anyone can read spot messages" ON spot_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM spots WHERE id = spot_id AND status = 'open'
    )
    OR EXISTS (
      SELECT 1 FROM spots WHERE id = spot_id AND auth.uid() = creator_id
    )
  );

-- メッセージ投稿：RLSはゆるめにして、アプリ側で参加条件チェック
CREATE POLICY "authenticated users can send spot messages" ON spot_messages
  FOR INSERT WITH CHECK (auth.uid() = sender_id);

-- 配信者のみ自分のスポットのメッセージをソフトデリート
CREATE POLICY "creator can soft delete messages" ON spot_messages
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM spots WHERE id = spot_id AND creator_id = auth.uid())
  );

-- スポット参加者テーブル（入退室管理）
CREATE TABLE IF NOT EXISTS spot_participants (
  spot_id uuid REFERENCES spots(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  joined_at timestamptz DEFAULT now() NOT NULL,
  kicked_at timestamptz,                               -- キック日時（NULLなら有効）
  PRIMARY KEY (spot_id, user_id)
);

ALTER TABLE spot_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can read participants" ON spot_participants
  FOR SELECT USING (true);

CREATE POLICY "users can join spots" ON spot_participants
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "creator can kick users" ON spot_participants
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM spots WHERE id = spot_id AND creator_id = auth.uid())
  );

-- モデレーター（配信者が指定）
CREATE TABLE IF NOT EXISTS spot_moderators (
  spot_id uuid REFERENCES spots(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  assigned_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (spot_id, user_id)
);

ALTER TABLE spot_moderators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can read moderators" ON spot_moderators
  FOR SELECT USING (true);

CREATE POLICY "creator can manage moderators" ON spot_moderators
  FOR ALL USING (
    EXISTS (SELECT 1 FROM spots WHERE id = spot_id AND creator_id = auth.uid())
  );

-- NGワード（クリエイターが追加）
CREATE TABLE IF NOT EXISTS spot_ng_words (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  word text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (creator_id, word)
);

ALTER TABLE spot_ng_words ENABLE ROW LEVEL SECURITY;

CREATE POLICY "creator can manage own ng words" ON spot_ng_words
  FOR ALL USING (auth.uid() = creator_id);

-- ブロック機能（既存のsecurity_featuresに追加 / Reach全体でブロック）
CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  blocked_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);

ALTER TABLE user_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can manage own blocks" ON user_blocks
  FOR ALL USING (auth.uid() = blocker_id);

CREATE POLICY "users can see who blocked them" ON user_blocks
  FOR SELECT USING (auth.uid() = blocked_id);

-- Reachデフォルトのシステムレベルのグローバルなコメントフィルタ用NGワード
CREATE TABLE IF NOT EXISTS system_ng_words (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  word text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE system_ng_words ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage system ng words" ON system_ng_words
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- spots にリアルタイム有効化
ALTER PUBLICATION supabase_realtime ADD TABLE spots;
ALTER PUBLICATION supabase_realtime ADD TABLE spot_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE spot_participants;

-- 最長1時間自動クローズ用のauto_close_atをトリガーでセット
CREATE OR REPLACE FUNCTION set_spot_auto_close()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.auto_close_at := NEW.opened_at + INTERVAL '1 hour';
  RETURN NEW;
END;
$$;

CREATE TRIGGER spot_auto_close_trigger
  BEFORE INSERT ON spots
  FOR EACH ROW EXECUTE FUNCTION set_spot_auto_close();
