-- ユーザープロフィール
create table profiles (
  id uuid references auth.users on delete cascade primary key,
  display_name text not null,
  bio text,
  avatar_url text,
  created_at timestamptz default now()
);

-- 発信者のブロードキャスト投稿
create table broadcasts (
  id uuid default gen_random_uuid() primary key,
  sender_id uuid references profiles(id) on delete cascade not null,
  content text not null,
  created_at timestamptz default now()
);

-- フォロー関係
create table follows (
  follower_id uuid references profiles(id) on delete cascade,
  following_id uuid references profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (follower_id, following_id)
);

-- DM
create table messages (
  id uuid default gen_random_uuid() primary key,
  broadcast_id uuid references broadcasts(id) on delete cascade,
  sender_id uuid references profiles(id) on delete cascade not null,
  receiver_id uuid references profiles(id) on delete cascade not null,
  content text not null,
  created_at timestamptz default now()
);

-- RLS有効化
alter table profiles enable row level security;
alter table broadcasts enable row level security;
alter table follows enable row level security;
alter table messages enable row level security;

-- profilesポリシー
create policy "profiles are viewable by everyone" on profiles for select using (true);
create policy "users can update own profile" on profiles for update using (auth.uid() = id);
create policy "users can insert own profile" on profiles for insert with check (auth.uid() = id);

-- broadcastsポリシー
create policy "broadcasts are viewable by everyone" on broadcasts for select using (true);
create policy "senders can insert broadcasts" on broadcasts for insert with check (auth.uid() = sender_id);

-- followsポリシー
create policy "follows are viewable by everyone" on follows for select using (true);
create policy "users can follow" on follows for insert with check (auth.uid() = follower_id);
create policy "users can unfollow" on follows for delete using (auth.uid() = follower_id);

-- messagesポリシー
create policy "messages viewable by sender or receiver" on messages for select using (auth.uid() = sender_id or auth.uid() = receiver_id);
create policy "users can send messages" on messages for insert with check (auth.uid() = sender_id);

-- サインアップ時にprofileを自動作成するトリガー
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
