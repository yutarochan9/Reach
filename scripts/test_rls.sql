ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE creator_earnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE dm_escalations ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE follower_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE recovery_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE rich_menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE step_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE step_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE step_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE talk_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin creates announcements" ON announcements AS PERMISSIVE FOR INSERT TO {, p, u, b, l, i, c, } WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));
CREATE POLICY "admin deletes announcements" ON announcements AS PERMISSIVE FOR DELETE TO {, p, u, b, l, i, c, } USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));
CREATE POLICY "anyone reads announcements" ON announcements AS PERMISSIVE FOR SELECT TO {, p, u, b, l, i, c, } USING (true);
CREATE POLICY "anyone reads active auto_responses" ON auto_responses AS PERMISSIVE FOR SELECT TO {, p, u, b, l, i, c, } USING ((is_active = true));
CREATE POLICY "creator manages auto_responses" ON auto_responses AS PERMISSIVE FOR ALL TO {, p, u, b, l, i, c, } USING ((auth.uid() = creator_id));
CREATE POLICY "senders can read counts" ON broadcast_reads AS PERMISSIVE FOR SELECT TO {, p, u, b, l, i, c, } USING ((EXISTS ( SELECT 1
   FROM broadcasts
  WHERE ((broadcasts.id = broadcast_reads.broadcast_id) AND (broadcasts.sender_id = auth.uid())))));
CREATE POLICY "users can manage own broadcast reads" ON broadcast_reads AS PERMISSIVE FOR ALL TO {, p, u, b, l, i, c, } USING ((auth.uid() = user_id));
CREATE POLICY "broadcasts are viewable by everyone" ON broadcasts AS PERMISSIVE FOR SELECT TO {, p, u, b, l, i, c, } USING (true);
CREATE POLICY "senders can delete own broadcasts" ON broadcasts AS PERMISSIVE FOR DELETE TO {, p, u, b, l, i, c, } USING ((auth.uid() = sender_id));
CREATE POLICY "senders can insert broadcasts" ON broadcasts AS PERMISSIVE FOR INSERT TO {, p, u, b, l, i, c, } WITH CHECK ((auth.uid() = sender_id));
CREATE POLICY "senders can update own broadcasts" ON broadcasts AS PERMISSIVE FOR UPDATE TO {, p, u, b, l, i, c, } USING ((auth.uid() = sender_id));
CREATE POLICY "admin reads contact" ON contact_messages AS PERMISSIVE FOR SELECT TO {, p, u, b, l, i, c, } USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));
CREATE POLICY "user inserts contact" ON contact_messages AS PERMISSIVE FOR INSERT TO {, p, u, b, l, i, c, } WITH CHECK (true);
CREATE POLICY "creators can view own earnings" ON creator_earnings AS PERMISSIVE FOR SELECT TO {, p, u, b, l, i, c, } USING ((auth.uid() = creator_id));
CREATE POLICY "own device sessions" ON device_sessions AS PERMISSIVE FOR ALL TO {, a, u, t, h, e, n, t, i, c, a, t, e, d, } USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "creator can resolve escalations" ON dm_escalations AS PERMISSIVE FOR UPDATE TO {, p, u, b, l, i, c, } USING ((creator_id = auth.uid())) WITH CHECK ((creator_id = auth.uid()));
CREATE POLICY "own escalations" ON dm_escalations AS PERMISSIVE FOR ALL TO {, a, u, t, h, e, n, t, i, c, a, t, e, d, } USING (((requester_id = auth.uid()) OR (creator_id = auth.uid()))) WITH CHECK ((requester_id = auth.uid()));
CREATE POLICY "requester can expire own escalations" ON dm_escalations AS PERMISSIVE FOR UPDATE TO {, p, u, b, l, i, c, } USING ((requester_id = auth.uid())) WITH CHECK ((requester_id = auth.uid()));
CREATE POLICY "admins can manage feature flags" ON feature_flags AS PERMISSIVE FOR ALL TO {, p, u, b, l, i, c, } USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));
CREATE POLICY "all users can read feature flags" ON feature_flags AS PERMISSIVE FOR SELECT TO {, p, u, b, l, i, c, } USING (true);
CREATE POLICY "fr_delete" ON follow_requests AS PERMISSIVE FOR DELETE TO {, p, u, b, l, i, c, } USING (((auth.uid() = requester_id) OR (auth.uid() = target_id)));
CREATE POLICY "fr_insert" ON follow_requests AS PERMISSIVE FOR INSERT TO {, p, u, b, l, i, c, } WITH CHECK ((auth.uid() = requester_id));
CREATE POLICY "fr_select" ON follow_requests AS PERMISSIVE FOR SELECT TO {, p, u, b, l, i, c, } USING (((auth.uid() = target_id) OR (auth.uid() = requester_id)));
CREATE POLICY "fr_update" ON follow_requests AS PERMISSIVE FOR UPDATE TO {, p, u, b, l, i, c, } USING ((auth.uid() = target_id));
CREATE POLICY "creator manages own follower tags" ON follower_tags AS PERMISSIVE FOR ALL TO {, p, u, b, l, i, c, } USING ((auth.uid() = creator_id));
CREATE POLICY "follower sees own tags" ON follower_tags AS PERMISSIVE FOR SELECT TO {, p, u, b, l, i, c, } USING ((auth.uid() = follower_id));
CREATE POLICY "follows are viewable by everyone" ON follows AS PERMISSIVE FOR SELECT TO {, p, u, b, l, i, c, } USING (true);
CREATE POLICY "targets can approve follow requests" ON follows AS PERMISSIVE FOR INSERT TO {, p, u, b, l, i, c, } WITH CHECK ((auth.uid() = following_id));
CREATE POLICY "users can follow" ON follows AS PERMISSIVE FOR INSERT TO {, p, u, b, l, i, c, } WITH CHECK ((auth.uid() = follower_id));
CREATE POLICY "users can unfollow" ON follows AS PERMISSIVE FOR DELETE TO {, p, u, b, l, i, c, } USING ((auth.uid() = follower_id));
CREATE POLICY "delete_ml" ON message_likes AS PERMISSIVE FOR DELETE TO {, p, u, b, l, i, c, } USING ((auth.uid() = user_id));
CREATE POLICY "insert_ml" ON message_likes AS PERMISSIVE FOR INSERT TO {, p, u, b, l, i, c, } WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "select_ml" ON message_likes AS PERMISSIVE FOR SELECT TO {, p, u, b, l, i, c, } USING (true);
CREATE POLICY "Public broadcast comments viewable" ON messages AS PERMISSIVE FOR SELECT TO {, a, u, t, h, e, n, t, i, c, a, t, e, d, } USING (((broadcast_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM broadcasts
  WHERE ((broadcasts.id = messages.broadcast_id) AND (broadcasts.public_reactions = true))))));
CREATE POLICY "messages viewable by sender or receiver" ON messages AS PERMISSIVE FOR SELECT TO {, p, u, b, l, i, c, } USING (((auth.uid() = sender_id) OR (auth.uid() = receiver_id)));
CREATE POLICY "users can send messages" ON messages AS PERMISSIVE FOR INSERT TO {, p, u, b, l, i, c, } WITH CHECK ((auth.uid() = sender_id));
CREATE POLICY "Service can insert notifications" ON notifications AS PERMISSIVE FOR INSERT TO {, p, u, b, l, i, c, } WITH CHECK (true);
CREATE POLICY "Users can read own notifications" ON notifications AS PERMISSIVE FOR SELECT TO {, p, u, b, l, i, c, } USING ((auth.uid() = user_id));
CREATE POLICY "Users can update own notifications" ON notifications AS PERMISSIVE FOR UPDATE TO {, p, u, b, l, i, c, } USING ((auth.uid() = user_id));
CREATE POLICY "system can insert notifications" ON notifications AS PERMISSIVE FOR INSERT TO {, p, u, b, l, i, c, } WITH CHECK (true);
CREATE POLICY "users can read own notifications" ON notifications AS PERMISSIVE FOR SELECT TO {, p, u, b, l, i, c, } USING ((auth.uid() = user_id));
CREATE POLICY "users can update own notifications" ON notifications AS PERMISSIVE FOR UPDATE TO {, p, u, b, l, i, c, } USING ((auth.uid() = user_id));
CREATE POLICY "profiles are viewable by everyone" ON profiles AS PERMISSIVE FOR SELECT TO {, p, u, b, l, i, c, } USING (true);
CREATE POLICY "users can insert own profile" ON profiles AS PERMISSIVE FOR INSERT TO {, p, u, b, l, i, c, } WITH CHECK ((auth.uid() = id));
CREATE POLICY "users can update own profile" ON profiles AS PERMISSIVE FOR UPDATE TO {, p, u, b, l, i, c, } USING ((auth.uid() = id));
CREATE POLICY "anyone can read reactions" ON reactions AS PERMISSIVE FOR SELECT TO {, p, u, b, l, i, c, } USING (true);
CREATE POLICY "users can manage own reactions" ON reactions AS PERMISSIVE FOR ALL TO {, p, u, b, l, i, c, } USING ((auth.uid() = user_id));
CREATE POLICY "users manage own recovery codes" ON recovery_codes AS PERMISSIVE FOR ALL TO {, p, u, b, l, i, c, } USING ((auth.uid() = user_id));
CREATE POLICY "admins can manage reports" ON reports AS PERMISSIVE FOR ALL TO {, p, u, b, l, i, c, } USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.is_admin = true)))));
CREATE POLICY "users can create reports" ON reports AS PERMISSIVE FOR INSERT TO {, p, u, b, l, i, c, } WITH CHECK ((auth.uid() = reporter_id));
CREATE POLICY "users can see own reports" ON reports AS PERMISSIVE FOR SELECT TO {, p, u, b, l, i, c, } USING ((auth.uid() = reporter_id));
CREATE POLICY "anyone reads active rich_menus" ON rich_menus AS PERMISSIVE FOR SELECT TO {, p, u, b, l, i, c, } USING ((is_active = true));
CREATE POLICY "creator manages rich_menu" ON rich_menus AS PERMISSIVE FOR ALL TO {, p, u, b, l, i, c, } USING ((auth.uid() = creator_id));
CREATE POLICY "creator sees enrollments" ON step_enrollments AS PERMISSIVE FOR SELECT TO {, p, u, b, l, i, c, } USING ((auth.uid() = creator_id));
CREATE POLICY "system inserts enrollments" ON step_enrollments AS PERMISSIVE FOR INSERT TO {, p, u, b, l, i, c, } WITH CHECK (true);
CREATE POLICY "creator manages step messages" ON step_messages AS PERMISSIVE FOR ALL TO {, p, u, b, l, i, c, } USING ((auth.uid() = ( SELECT step_sequences.creator_id
   FROM step_sequences
  WHERE (step_sequences.id = step_messages.sequence_id))));
CREATE POLICY "creator manages sequences" ON step_sequences AS PERMISSIVE FOR ALL TO {, p, u, b, l, i, c, } USING ((auth.uid() = creator_id));
CREATE POLICY "�T�u�X�N�o�^" ON subscriptions AS PERMISSIVE FOR INSERT TO {, p, u, b, l, i, c, } WITH CHECK ((subscriber_id = auth.uid()));
CREATE POLICY "�T�u�X�N�폜" ON subscriptions AS PERMISSIVE FOR DELETE TO {, p, u, b, l, i, c, } USING ((subscriber_id = auth.uid()));
CREATE POLICY "�T�u�X�N����" ON subscriptions AS PERMISSIVE FOR UPDATE TO {, p, u, b, l, i, c, } USING ((subscriber_id = auth.uid()));
CREATE POLICY "�����̃T�u�X�N����ǂ߂�" ON subscriptions AS PERMISSIVE FOR SELECT TO {, p, u, b, l, i, c, } USING (((subscriber_id = auth.uid()) OR (creator_id = auth.uid())));
CREATE POLICY "users can manage own reads" ON talk_reads AS PERMISSIVE FOR ALL TO {, p, u, b, l, i, c, } USING ((auth.uid() = user_id));