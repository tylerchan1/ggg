begin;

create table if not exists public.re_teachers (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table if not exists public.re_classes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.re_teachers(user_id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.re_players (
  session_id uuid not null references public.re_classes(id) on delete cascade,
  id uuid not null,
  token uuid not null,
  name text not null check (char_length(name) between 1 and 40),
  revision integer not null default 0,
  payload jsonb not null default '{"status":"playing"}',
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (session_id, id)
);

alter table public.re_teachers enable row level security;
alter table public.re_classes enable row level security;
alter table public.re_players enable row level security;
revoke all on public.re_teachers, public.re_classes, public.re_players from public, anon, authenticated;
grant select on public.re_classes to authenticated;

drop policy if exists teacher_realtime on public.re_classes;
create policy teacher_realtime on public.re_classes
  for select to authenticated using (owner_id = (select auth.uid()));

create or replace function public.create_class()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  new_class public.re_classes;
begin
  if not exists (select 1 from public.re_teachers where user_id = auth.uid()) then
    raise exception '교사 계정으로 등록된 사용자가 아닙니다.';
  end if;

  loop
    insert into public.re_classes (owner_id, code)
    values (auth.uid(), upper(substr(gen_random_uuid()::text, 1, 8)))
    on conflict (code) do nothing
    returning * into new_class;
    exit when found;
  end loop;

  return jsonb_build_object('id', new_class.id, 'code', new_class.code, 'createdAt', new_class.created_at);
end;
$$;

create or replace function public.list_classes()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.re_teachers where user_id = auth.uid()) then
    raise exception '교사 계정으로 등록된 사용자가 아닙니다.';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'code', code, 'createdAt', created_at) order by created_at desc)
    from public.re_classes where owner_id = auth.uid()
  ), '[]'::jsonb);
end;
$$;

create or replace function public.list_players(p_session uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.re_classes where id = p_session and owner_id = auth.uid()) then
    raise exception '이 수업을 조회할 권한이 없습니다.';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'payload', payload, 'updatedAt', updated_at) order by joined_at, id)
    from public.re_players where session_id = p_session
  ), '[]'::jsonb);
end;
$$;

create or replace function public.join_class(p_code text, p_name text, p_player uuid, p_token uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  target uuid;
begin
  if p_player is null or p_token is null or coalesce(char_length(trim(p_name)), 0) not between 1 and 40 then
    raise exception '학생 정보를 확인해 주세요.';
  end if;

  select id into target from public.re_classes where code = upper(trim(p_code));
  if target is null then
    raise exception '유효한 수업 참여 코드를 입력해 주세요.';
  end if;

  insert into public.re_players (session_id, id, token, name)
  values (target, p_player, p_token, trim(p_name))
  on conflict (session_id, id) do nothing;

  if found then
    update public.re_classes set updated_at = clock_timestamp() where id = target;
  elsif not exists (
    select 1 from public.re_players where session_id = target and id = p_player and token = p_token
  ) then
    raise exception '학생 정보를 확인해 주세요.';
  end if;

  return target;
end;
$$;

create or replace function public.save_player(p_session uuid, p_player uuid, p_token uuid, p_revision integer, p_payload jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.re_players where session_id = p_session and id = p_player and token = p_token
  ) then
    raise exception '학생 정보를 확인해 주세요.';
  end if;

  if p_revision is null or p_revision < 1 or p_payload is null or
      jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 48000 or
      coalesce(p_payload->>'status', '') not in ('playing', 'submitted') then
    raise exception '게임 상태를 확인해 주세요.';
  end if;

  update public.re_players
  set revision = p_revision, payload = p_payload, updated_at = clock_timestamp()
  where session_id = p_session and id = p_player and token = p_token
    and revision < p_revision and payload->>'status' <> 'submitted';

  if found then
    update public.re_classes set updated_at = clock_timestamp() where id = p_session;
    return true;
  end if;

  return exists (
    select 1 from public.re_players where session_id = p_session and id = p_player
      and token = p_token and revision = p_revision and payload = p_payload
  );
end;
$$;

revoke execute on function public.create_class(), public.list_classes(), public.list_players(uuid),
  public.join_class(text, text, uuid, uuid), public.save_player(uuid, uuid, uuid, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_class(), public.list_classes(), public.list_players(uuid) to authenticated;
grant execute on function public.join_class(text, text, uuid, uuid),
  public.save_player(uuid, uuid, uuid, integer, jsonb) to anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 're_classes'
  ) then
    alter publication supabase_realtime add table public.re_classes;
  end if;
end;
$$;

commit;
