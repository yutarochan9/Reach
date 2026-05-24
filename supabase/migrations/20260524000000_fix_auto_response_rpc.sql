-- Fix check_and_send_auto_response: rewrite as SQL function to avoid PL/pgSQL FOREACH control flow bug
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
    AND (
      SELECT bool_or(lower(p_message) LIKE ('%' || lower(kw) || '%'))
      FROM unnest(
        CASE WHEN array_length(ar.keywords, 1) > 0
             THEN ar.keywords
             ELSE ARRAY[ar.keyword]
        END
      ) AS kw
    ) = true
  LIMIT 1;
$$;
