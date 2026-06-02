-- フロー配信用カラムをbroadcastsに追加
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS recipient_id uuid REFERENCES profiles(id);
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS step_message_id uuid REFERENCES step_messages(id);

CREATE INDEX IF NOT EXISTS idx_broadcasts_recipient_id ON broadcasts(recipient_id);
CREATE INDEX IF NOT EXISTS idx_broadcasts_step_message_id ON broadcasts(step_message_id);

-- 動画配信カラム
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS video_url text;
