-- 家族グループ
create table if not exists families (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamp with time zone default now()
);

-- 家族メンバー
create table if not exists family_members (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references families(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text,
  email      text,
  joined_at  timestamp with time zone default now(),
  unique(user_id)
);

-- 買い物リスト
create table if not exists shopping_lists (
  id         uuid primary key default gen_random_uuid(),
  family_id  uuid not null references families(id) on delete cascade,
  name       text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone default now()
);

-- 買い物アイテム
create table if not exists shopping_items (
  id         uuid primary key default gen_random_uuid(),
  list_id    uuid not null references shopping_lists(id) on delete cascade,
  name       text not null,
  memo       text,
  added_by   text,
  checked    boolean not null default false,
  created_at timestamp with time zone default now()
);
