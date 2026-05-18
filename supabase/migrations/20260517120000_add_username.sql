alter table profiles add column if not exists username text unique;
create index if not exists profiles_username_idx on profiles(username);
