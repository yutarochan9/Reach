create table if not exists reactions (
  id uuid primary key default gen_random_uuid(),
  broadcast_id uuid references broadcasts(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  type text default 'like',
  created_at timestamptz default now(),
  unique(broadcast_id, user_id, type)
);
alter table reactions enable row level security;
create policy "anyone can read reactions" on reactions for select using (true);
create policy "users can manage own reactions" on reactions for all using (auth.uid() = user_id);

create table if not exists broadcast_reads (
  broadcast_id uuid references broadcasts(id) on delete cascade,
  user_id uuid references profiles(id) on delete cascade,
  read_at timestamptz default now(),
  primary key (broadcast_id, user_id)
);
alter table broadcast_reads enable row level security;
create policy "users can manage own broadcast reads" on broadcast_reads for all using (auth.uid() = user_id);
create policy "senders can read counts" on broadcast_reads for select using (
  exists (select 1 from broadcasts where broadcasts.id = broadcast_id and broadcasts.sender_id = auth.uid())
);
