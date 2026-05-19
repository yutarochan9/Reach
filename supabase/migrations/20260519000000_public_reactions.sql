-- 配信への公開リアクション機能
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS public_reactions boolean DEFAULT false NOT NULL;

-- コメントへの返信サポート
ALTER TABLE messages ADD COLUMN IF NOT EXISTS parent_message_id uuid REFERENCES messages(id) ON DELETE SET NULL;

-- public_reactions=trueの配信のトップレベルコメント（返信除く）のみ全員が閲覧可能
DROP POLICY IF EXISTS "Public broadcast comments viewable" ON messages;
CREATE POLICY "Public broadcast top-level comments viewable" ON messages
FOR SELECT TO authenticated
USING (
  broadcast_id IS NOT NULL AND
  parent_message_id IS NULL AND
  EXISTS (
    SELECT 1 FROM broadcasts
    WHERE id = messages.broadcast_id
    AND public_reactions = true
  )
);
