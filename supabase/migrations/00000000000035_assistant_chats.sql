create table if not exists assistant_chats (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists assistant_chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references assistant_chats(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists assistant_chats_user_updated_idx
  on assistant_chats (user_id, updated_at desc);

create index if not exists assistant_chat_messages_chat_created_idx
  on assistant_chat_messages (chat_id, created_at);

alter table assistant_chats enable row level security;
alter table assistant_chat_messages enable row level security;

drop policy if exists "Users can view their assistant chats" on assistant_chats;
create policy "Users can view their assistant chats"
  on assistant_chats for select
  using (
    user_id = auth.uid()
    and organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

drop policy if exists "Users can create assistant chats in their organization" on assistant_chats;
create policy "Users can create assistant chats in their organization"
  on assistant_chats for insert
  with check (
    user_id = auth.uid()
    and organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

drop policy if exists "Users can update their assistant chats" on assistant_chats;
create policy "Users can update their assistant chats"
  on assistant_chats for update
  using (
    user_id = auth.uid()
    and organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

drop policy if exists "Users can delete their assistant chats" on assistant_chats;
create policy "Users can delete their assistant chats"
  on assistant_chats for delete
  using (
    user_id = auth.uid()
    and organization_id in (
      select organization_id from members where user_id = auth.uid()
    )
  );

drop policy if exists "Users can view messages in their assistant chats" on assistant_chat_messages;
create policy "Users can view messages in their assistant chats"
  on assistant_chat_messages for select
  using (
    chat_id in (
      select id from assistant_chats
      where user_id = auth.uid()
        and organization_id in (
          select organization_id from members where user_id = auth.uid()
        )
    )
  );

drop policy if exists "Users can insert messages in their assistant chats" on assistant_chat_messages;
create policy "Users can insert messages in their assistant chats"
  on assistant_chat_messages for insert
  with check (
    chat_id in (
      select id from assistant_chats
      where user_id = auth.uid()
        and organization_id in (
          select organization_id from members where user_id = auth.uid()
        )
    )
  );

drop policy if exists "Users can delete messages in their assistant chats" on assistant_chat_messages;
create policy "Users can delete messages in their assistant chats"
  on assistant_chat_messages for delete
  using (
    chat_id in (
      select id from assistant_chats
      where user_id = auth.uid()
        and organization_id in (
          select organization_id from members where user_id = auth.uid()
        )
    )
  );
