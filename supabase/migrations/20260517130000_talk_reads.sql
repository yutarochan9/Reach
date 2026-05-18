create table if not exists talk_reads (
  user_id uuid references profiles(id) on delete cascade,
  sender_id uuid references profiles(id) on delete cascade,
  last_read_at timestamptz default now(),
  primary key (user_id, sender_id)
);
alter table talk_reads enable row level security;
create policy "users can manage own reads" on talk_reads for all using (auth.uid() = user_id);
