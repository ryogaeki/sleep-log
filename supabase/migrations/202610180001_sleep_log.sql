-- Supabase SQL Editorで1回実行。全体をトランザクションにして途中の適用を防ぐ。
begin;
create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;
set local search_path = public, extensions;

create table public.app_members (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table public.sleep_entries (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  kind text not null check (kind in ('normal','nap','doze','other')),
  intention text not null check (intention in ('intentional','unintentional','unknown')),
  start_accuracy text not null check (start_accuracy in ('exact','estimated')),
  end_accuracy text not null check (end_accuracy in ('exact','estimated')),
  record_timezone text not null default 'Asia/Tokyo' check (record_timezone = 'Asia/Tokyo'),
  note text check (char_length(note) <= 2000),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  revision integer not null default 1 check (revision > 0),
  constraint sleep_finite check (isfinite(start_at) and isfinite(end_at)),
  constraint sleep_whole_minutes check (extract(second from start_at) = 0 and extract(second from end_at) = 0),
  constraint sleep_positive_duration check (end_at > start_at),
  constraint sleep_no_overlap exclude using gist (user_id with =, tstzrange(start_at, end_at, '[)') with &&)
);
create index sleep_entries_owner_start on public.sleep_entries(user_id, start_at, id);
create index sleep_entries_owner_end on public.sleep_entries(user_id, end_at);

create function public.guard_sleep_entry() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if new.end_at > clock_timestamp() then
    raise exception using errcode = '23514', message = 'SLEEP_FUTURE';
  end if;
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.user_id is distinct from old.user_id
       or new.created_at is distinct from old.created_at then
      raise exception using errcode = '23514', message = 'SLEEP_IMMUTABLE';
    end if;
    new.revision := old.revision + 1;
    new.created_at := old.created_at;
  else
    new.revision := 1;
    new.created_at := clock_timestamp();
  end if;
  new.updated_at := clock_timestamp();
  if new.note = '' then new.note := null; end if;
  return new;
end;
$$;
create trigger sleep_entry_guard before insert or update on public.sleep_entries
for each row execute function public.guard_sleep_entry();

alter table public.app_members enable row level security;
alter table public.sleep_entries enable row level security;
create policy member_self on public.app_members for select to authenticated
using (user_id = (select auth.uid()));
create policy sleep_read on public.sleep_entries for select to authenticated using (
  user_id = (select auth.uid()) and exists (select 1 from public.app_members where user_id = (select auth.uid()))
);
create policy sleep_insert on public.sleep_entries for insert to authenticated with check (
  user_id = (select auth.uid()) and exists (select 1 from public.app_members where user_id = (select auth.uid()))
);
create policy sleep_update on public.sleep_entries for update to authenticated using (
  user_id = (select auth.uid()) and exists (select 1 from public.app_members where user_id = (select auth.uid()))
) with check (
  user_id = (select auth.uid()) and exists (select 1 from public.app_members where user_id = (select auth.uid()))
);
create policy sleep_delete on public.sleep_entries for delete to authenticated using (
  user_id = (select auth.uid()) and exists (select 1 from public.app_members where user_id = (select auth.uid()))
);
revoke all on public.app_members, public.sleep_entries from public, anon, authenticated;
grant select on public.app_members to authenticated;
grant select, delete on public.sleep_entries to authenticated;
grant insert (id,user_id,start_at,end_at,kind,intention,start_accuracy,end_accuracy,record_timezone,note)
  on public.sleep_entries to authenticated;
grant update (start_at,end_at,kind,intention,start_accuracy,end_accuracy,record_timezone,note)
  on public.sleep_entries to authenticated;

-- STABLE関数内で1つのスナップショットを取得。行数上限を避け1つのJSONを返す。
create function public.export_sleep_backup() returns jsonb
language plpgsql stable security invoker set search_path = public, pg_temp as $$
declare records jsonb;
begin
  if not exists (select 1 from public.app_members where user_id = auth.uid()) then
    raise exception using errcode = '42501', message = 'SLEEP_NOT_MEMBER';
  end if;
  select coalesce(jsonb_agg(to_jsonb(e) - 'user_id' order by e.start_at, e.id), '[]'::jsonb)
    into records from public.sleep_entries e where e.user_id = auth.uid();
  return jsonb_build_object('format','sleep-log-backup','version',1,
    'exported_at',now(),'timezone','Asia/Tokyo','count',jsonb_array_length(records),'entries',records);
end;
$$;

-- 一括復元。RLSを回避せず、1件でもエラーがあれば全体をロールバックする。
create function public.restore_sleep_backup(p_backup jsonb) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare item jsonb; existing public.sleep_entries%rowtype;
  added integer := 0; kept integer := 0; changed integer := 0;
begin
  if not exists (select 1 from public.app_members where user_id = auth.uid()) then
    raise exception using errcode = '42501', message = 'SLEEP_NOT_MEMBER';
  end if;
  if p_backup->>'format' is distinct from 'sleep-log-backup'
     or p_backup->'version' is distinct from '1'::jsonb
     or p_backup->>'timezone' is distinct from 'Asia/Tokyo'
     or jsonb_typeof(p_backup->'entries') is distinct from 'array'
     or jsonb_typeof(p_backup->'count') is distinct from 'number'
     or p_backup->>'exported_at' is null
     or not ((p_backup->>'exported_at') ~ '(Z|[+-][0-9]{2}:[0-9]{2})$') then
    raise exception using errcode='22023', message='SLEEP_INVALID_BACKUP';
  end if;
  perform (p_backup->>'exported_at')::timestamptz;
  if (p_backup->>'count')::integer <> jsonb_array_length(p_backup->'entries') then
    raise exception using errcode='22023', message='SLEEP_INVALID_COUNT';
  end if;
  if (select count(distinct (value->>'id')::uuid) from jsonb_array_elements(p_backup->'entries'))
     <> jsonb_array_length(p_backup->'entries') then
    raise exception using errcode='22023', message='SLEEP_DUPLICATE_IDS';
  end if;

  -- 復元中の別端末からの書き込みも含めて直列化する。初期版は本人1人。
  lock table public.sleep_entries in share row exclusive mode;
  for item in select value from jsonb_array_elements(p_backup->'entries') loop
    if jsonb_typeof(item) is distinct from 'object'
      or jsonb_typeof(item->'id') is distinct from 'string'
      or jsonb_typeof(item->'start_at') is distinct from 'string'
      or jsonb_typeof(item->'end_at') is distinct from 'string'
      or jsonb_typeof(item->'kind') is distinct from 'string'
      or jsonb_typeof(item->'intention') is distinct from 'string'
      or jsonb_typeof(item->'start_accuracy') is distinct from 'string'
      or jsonb_typeof(item->'end_accuracy') is distinct from 'string'
      or item->>'record_timezone' is distinct from 'Asia/Tokyo'
      or not (item ? 'note')
      or jsonb_typeof(item->'note') not in ('string','null')
      or not ((item->>'start_at') ~ '(Z|[+-][0-9]{2}:[0-9]{2})$')
      or not ((item->>'end_at') ~ '(Z|[+-][0-9]{2}:[0-9]{2})$') then
      raise exception using errcode='22023', message='SLEEP_INVALID_ENTRY';
    end if;
    -- 既存IDも含め、必須属性と日時の不正を確認する。
    if item->>'kind' not in ('normal','nap','doze','other')
      or item->>'intention' not in ('intentional','unintentional','unknown')
      or item->>'start_accuracy' not in ('exact','estimated')
      or item->>'end_accuracy' not in ('exact','estimated')
      or char_length(item->>'note') > 2000
      or not isfinite((item->>'start_at')::timestamptz)
      or not isfinite((item->>'end_at')::timestamptz)
      or extract(second from (item->>'start_at')::timestamptz) <> 0
      or extract(second from (item->>'end_at')::timestamptz) <> 0
      or (item->>'end_at')::timestamptz <= (item->>'start_at')::timestamptz
      or (item->>'end_at')::timestamptz > clock_timestamp() then
      raise exception using errcode='22023', message='SLEEP_INVALID_ENTRY';
    end if;
  end loop;
  if exists (
    with ranges as (
      select (value->>'start_at')::timestamptz as start_at, (value->>'end_at')::timestamptz as end_at
      from jsonb_array_elements(p_backup->'entries')
    ), ordered as (
      select start_at, max(end_at) over(order by start_at,end_at rows between unbounded preceding and 1 preceding) as previous_end
      from ranges
    ) select 1 from ordered where start_at < previous_end
  ) then raise exception using errcode='23P01', message='SLEEP_BACKUP_OVERLAP'; end if;

  for item in select value from jsonb_array_elements(p_backup->'entries') loop
    select * into existing from public.sleep_entries where id=(item->>'id')::uuid and user_id=auth.uid();
    if found then
      kept := kept + 1;
      if existing.start_at is distinct from (item->>'start_at')::timestamptz
         or existing.end_at is distinct from (item->>'end_at')::timestamptz
         or existing.kind is distinct from item->>'kind'
         or existing.intention is distinct from item->>'intention'
         or existing.start_accuracy is distinct from item->>'start_accuracy'
         or existing.end_accuracy is distinct from item->>'end_accuracy'
         or existing.note is distinct from nullif(item->>'note','') then changed := changed + 1; end if;
    else
      insert into public.sleep_entries(id,user_id,start_at,end_at,kind,intention,start_accuracy,end_accuracy,record_timezone,note)
      values((item->>'id')::uuid,auth.uid(),(item->>'start_at')::timestamptz,(item->>'end_at')::timestamptz,
        item->>'kind',item->>'intention',item->>'start_accuracy',item->>'end_accuracy','Asia/Tokyo',item->>'note');
      added := added + 1;
    end if;
  end loop;
  return jsonb_build_object('added',added,'kept',kept,'changed',changed);
end;
$$;
revoke all on function public.guard_sleep_entry(), public.export_sleep_backup(), public.restore_sleep_backup(jsonb) from public, anon;
grant execute on function public.export_sleep_backup(), public.restore_sleep_backup(jsonb) to authenticated;
commit;
