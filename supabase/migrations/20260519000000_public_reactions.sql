-- 配信への公開リアクション機能
ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS public_reactions boolean DEFAULT false NOT NULL;

-- public_reactions=trueの配信のコメントは認証済みユーザー全員が閲覧可能
CREATE POLICY "Public broadcast comments viewable" ON messages
FOR SELECT TO authenticated
USING (
  broadcast_id IS NOT NULL AND
  EXISTS (
    SELECT 1 FROM broadcasts
    WHERE id = messages.broadcast_id
    AND public_reactions = true
  )
);
