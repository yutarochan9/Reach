-- keywords列（既存バグ修正）
ALTER TABLE auto_responses
  ADD COLUMN IF NOT EXISTS keywords text[] DEFAULT '{}'::text[];

-- keywordからkeywordsへバックフィル
UPDATE auto_responses
SET keywords = ARRAY[keyword]
WHERE (keywords IS NULL OR keywords = '{}') AND keyword IS NOT NULL AND keyword != '';

-- 一致方法（部分一致 or 完全一致）
ALTER TABLE auto_responses
  ADD COLUMN IF NOT EXISTS match_type text NOT NULL DEFAULT 'contains';

-- 優先度（小さいほど優先）
ALTER TABLE auto_responses
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0;

-- 時間帯制限（NULLなら制限なし）
ALTER TABLE auto_responses
  ADD COLUMN IF NOT EXISTS time_from time,
  ADD COLUMN IF NOT EXISTS time_to time;

-- RPC更新：match_type・priority・時間帯に対応
CREATE OR REPLACE FUNCTION check_and_send_auto_response(
  p_creator_id uuid,
  p_receiver_id uuid,
  p_message text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO messages (sender_id, receiver_id, content)
  SELECT p_creator_id, p_receiver_id, ar.response_text
  FROM auto_responses ar
  WHERE ar.creator_id = p_creator_id
    AND ar.is_active = true
    -- 時間帯チェック（両方NULLなら制限なし）
    AND (
      ar.time_from IS NULL OR ar.time_to IS NULL OR (
        CASE WHEN ar.time_from <= ar.time_to
          THEN (now() AT TIME ZONE 'Asia/Tokyo')::time BETWEEN ar.time_from AND ar.time_to
          ELSE (now() AT TIME ZONE 'Asia/Tokyo')::time >= ar.time_from
            OR (now() AT TIME ZONE 'Asia/Tokyo')::time <= ar.time_to
        END
      )
    )
    -- キーワードマッチ（部分一致 or 完全一致）
    AND EXISTS (
      SELECT 1
      FROM unnest(
        CASE WHEN array_length(ar.keywords, 1) > 0
             THEN ar.keywords
             ELSE ARRAY[ar.keyword]
        END
      ) AS kw
      WHERE CASE ar.match_type
        WHEN 'exact' THEN lower(p_message) = lower(kw)
        ELSE lower(p_message) LIKE '%' || lower(kw) || '%'
      END
    )
  ORDER BY ar.priority ASC
  LIMIT 1;
$$;
