-- broadcasts テーブルに下書き・予約配信・ターゲット機能を追加
alter table broadcasts
  add column if not exists status text not null default 'published',
  add column if not exists scheduled_at timestamptz,
  add column if not exists image_url text,
  add column if not exists block_order int not null default 0,
  add column if not exists target text not null default 'all';

-- 既存レコードのステータスを published に設定
update broadcasts set status = 'published' where status is null;

-- 発信者が自分の配信を更新・削除できるポリシー
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'broadcasts' and policyname = 'senders can update own broadcasts'
  ) then
    create policy "senders can update own broadcasts" on broadcasts
      for update using (auth.uid() = sender_id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'broadcasts' and policyname = 'senders can delete own broadcasts'
  ) then
    create policy "senders can delete own broadcasts" on broadcasts
      for delete using (auth.uid() = sender_id);
  end if;
end $$;

-- broadcast-images ストレージバケット
insert into storage.buckets (id, name, public)
  values ('broadcast-images', 'broadcast-images', true)
  on conflict (id) do nothing;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'objects' and policyname = 'broadcast images are public'
  ) then
    create policy "broadcast images are public" on storage.objects
      for select using (bucket_id = 'broadcast-images');
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'objects' and policyname = 'users can upload broadcast images'
  ) then
    create policy "users can upload broadcast images" on storage.objects
      for insert with check (
        bucket_id = 'broadcast-images' and auth.uid()::text = (storage.foldername(name))[1]
      );
  end if;
end $$;
