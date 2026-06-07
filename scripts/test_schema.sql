CREATE TABLE IF NOT EXISTS profiles (
  id uuid NOT NULL,
  display_name text NOT NULL,
  bio text,
  avatar_url text,
  created_at timestamptz DEFAULT now(),
  username text,
  push_token text,
  push_enabled boolean DEFAULT true NOT NULL,
  plan text NOT NULL,
  stripe_customer_id text,
  subscription_id text,
  subscription_status text,
  plan_expires_at timestamptz,
  sns_links jsonb,
  is_official boolean DEFAULT false NOT NULL,
  is_admin boolean DEFAULT false NOT NULL,
  notification_settings jsonb,
  is_banned boolean DEFAULT false NOT NULL,
  past_broadcasts_visible boolean DEFAULT true NOT NULL,
  tags text[],
  membership_price integer,
  membership_active boolean DEFAULT false,
  membership_welcome text,
  membership_benefits text[],
  membership_community boolean DEFAULT false,
  membership_close_date timestamptz,
  membership_close_message text,
  membership_description text,
  is_private boolean DEFAULT false,
  pinned_broadcast_id uuid,
  escalation_button_enabled boolean DEFAULT false,
  stripe_connect_account_id text,
  stripe_connect_onboarded boolean DEFAULT false,
  bank_name text,
  bank_branch_name text,
  bank_account_type text,
  bank_account_number text,
  bank_account_holder text,
  bank_registered_at timestamptz,
  bank_code text,
  bank_branch_code text,
  kyc_dob_year integer,
  kyc_dob_month integer,
  kyc_dob_day integer,
  kyc_phone text,
  kyc_postal_code text,
  kyc_address_state text,
  kyc_address_city text,
  kyc_address_line1 text,
  kyc_completed_at timestamptz,
  kyc_document_path text,
  kyc_document_uploaded_at timestamptz,
  is_test boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS step_sequences (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  creator_id uuid,
  name text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS step_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  sequence_id uuid,
  day_offset integer NOT NULL,
  content text NOT NULL,
  sort_order integer,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS broadcasts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  sender_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now(),
  status text,
  scheduled_at timestamptz,
  image_url text,
  block_order integer,
  target text,
  group_id uuid,
  step_message_id uuid,
  recipient_id uuid,
  public_reactions boolean DEFAULT false NOT NULL,
  visible_to_new_followers boolean DEFAULT true NOT NULL,
  is_subscriber_only boolean DEFAULT false NOT NULL,
  image_link_url text,
  video_url text,
  comments_disabled boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS follows (
  follower_id uuid NOT NULL,
  following_id uuid NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS follow_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  requester_id uuid NOT NULL,
  target_id uuid NOT NULL,
  status text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS follower_tags (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  creator_id uuid,
  follower_id uuid,
  tag text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS announcements (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  tag text
);

CREATE TABLE IF NOT EXISTS auto_responses (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  creator_id uuid,
  keyword text NOT NULL,
  response_text text NOT NULL,
  is_active boolean DEFAULT true,
  match_count integer,
  created_at timestamptz DEFAULT now(),
  keywords text[],
  match_type text NOT NULL,
  priority integer NOT NULL,
  time_from time,
  time_to time
);

CREATE TABLE IF NOT EXISTS broadcast_reads (
  broadcast_id uuid NOT NULL,
  user_id uuid NOT NULL,
  read_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contact_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  reply_email text,
  category text NOT NULL,
  body text NOT NULL,
  created_at timestamptz DEFAULT now(),
  status text,
  admin_note text
);

CREATE TABLE IF NOT EXISTS creator_earnings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  creator_id uuid NOT NULL,
  subscriber_id uuid,
  amount integer NOT NULL,
  creator_amount integer NOT NULL,
  reach_amount integer NOT NULL,
  stripe_subscription_id text,
  payout_status text NOT NULL,
  payout_date date,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS device_sessions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  device_name text NOT NULL,
  platform text NOT NULL,
  device_key text NOT NULL,
  last_seen timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  is_host boolean DEFAULT false,
  status text,
  location text
);

CREATE TABLE IF NOT EXISTS dm_escalations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  requester_id uuid NOT NULL,
  creator_id uuid NOT NULL,
  status text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feature_flags (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  key text NOT NULL,
  enabled boolean DEFAULT false NOT NULL,
  description text,
  target_user_ids text[],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS message_likes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  message_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  broadcast_id uuid,
  sender_id uuid NOT NULL,
  receiver_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now(),
  reply_to_id uuid,
  parent_message_id uuid,
  is_auto boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  type text NOT NULL,
  actor_id uuid,
  broadcast_id uuid,
  read boolean DEFAULT false NOT NULL,
  created_at timestamptz DEFAULT now(),
  metadata jsonb
);

CREATE TABLE IF NOT EXISTS reactions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  broadcast_id uuid,
  user_id uuid,
  type text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recovery_codes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  code_hash text NOT NULL,
  used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reports (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  reporter_id uuid NOT NULL,
  reported_user_id uuid,
  reported_broadcast_id uuid,
  reason text NOT NULL,
  details text,
  status text NOT NULL,
  admin_note text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rich_menus (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  creator_id uuid,
  buttons jsonb NOT NULL,
  is_active boolean DEFAULT true,
  updated_at timestamptz DEFAULT now(),
  panel_bg_image text
);

CREATE TABLE IF NOT EXISTS step_enrollments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  follower_id uuid,
  creator_id uuid,
  sequence_id uuid,
  enrolled_at timestamptz DEFAULT now(),
  completed boolean DEFAULT false
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  subscriber_id uuid NOT NULL,
  creator_id uuid NOT NULL,
  status text NOT NULL,
  stripe_subscription_id text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz,
  cancel_reason text,
  expires_at timestamptz
);

CREATE TABLE IF NOT EXISTS support_payments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  amount integer NOT NULL,
  currency text NOT NULL,
  stripe_payment_id text,
  note text,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS talk_reads (
  user_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  last_read_at timestamptz DEFAULT now()
);