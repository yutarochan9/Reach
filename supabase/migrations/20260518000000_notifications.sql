-- 通知テーブル
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  type text not null,  -- 'like' | 'follow'
  actor_id uuid references profiles(id) on delete cascade,
  broadcast_id uuid references broadcasts(id) on delete cascade,
  read boolean not null default false,
  created_at timestamptz default now()
);

alter table notifications enable row level security;

create policy "users can read own notifications" on notifications
  for select using (auth.uid() = user_id);

create policy "users can update own notifications" on notifications
  for update using (auth.uid() = user_id);

create policy "system can insert notifications" on notifications
  for insert with check (true);

-- reactions INSERT → いいね通知
create or replace function public.handle_new_reaction()
returns trigger as $$
declare
  v_sender_id uuid;
begin
  select sender_id into v_sender_id from broadcasts where id = new.broadcast_id;
  if v_sender_id is not null and v_sender_id != new.user_id then
    insert into notifications (user_id, type, actor_id, broadcast_id)
    values (v_sender_id, 'like', new.user_id, new.broadcast_id);
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_reaction_created on reactions;
create trigger on_reaction_created
  after insert on reactions
  for each row execute procedure public.handle_new_reaction();

-- follows INSERT → フォロー通知
create or replace function public.handle_new_follow()
returns trigger as $$
begin
  insert into notifications (user_id, type, actor_id)
  values (new.following_id, 'follow', new.follower_id);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_follow_created on follows;
create trigger on_follow_created
  after insert on follows
  for each row execute procedure public.handle_new_follow();
