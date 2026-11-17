-- 既存プロジェクト用。SQL Editorでこのファイル全体を実行します。
-- 削除するデータは眠った意図・開始/終了時刻の精度の3列だけです。
-- 睡眠日時・種類・ノート・ID・更新番号・利用許可は保持します。
begin;
lock table public.sleep_entries in access exclusive mode;
alter table public.sleep_entries
  drop column if exists intention,
  drop column if exists start_accuracy,
  drop column if exists end_accuracy;

-- 新旧どちらのバックアップも読めます。廃止項目は無視します。
create or replace function public.restore_sleep_backup(p_backup jsonb) returns jsonb
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
      or item->>'record_timezone' is distinct from 'Asia/Tokyo'
      or not (item ? 'note')
      or jsonb_typeof(item->'note') not in ('string','null')
      or not ((item->>'start_at') ~ '(Z|[+-][0-9]{2}:[0-9]{2})$')
      or not ((item->>'end_at') ~ '(Z|[+-][0-9]{2}:[0-9]{2})$') then
      raise exception using errcode='22023', message='SLEEP_INVALID_ENTRY';
    end if;
    -- 既存IDも含め、必須属性と日時の不正を確認する。
    if item->>'kind' not in ('normal','nap','doze','other')
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
         or existing.note is distinct from nullif(item->>'note','') then changed := changed + 1; end if;
    else
      insert into public.sleep_entries(id,user_id,start_at,end_at,kind,record_timezone,note)
      values((item->>'id')::uuid,auth.uid(),(item->>'start_at')::timestamptz,(item->>'end_at')::timestamptz,
        item->>'kind','Asia/Tokyo',item->>'note');
      added := added + 1;
    end if;
  end loop;
  return jsonb_build_object('added',added,'kept',kept,'changed',changed);
end;
$$;
revoke all on function public.restore_sleep_backup(jsonb) from public, anon;
grant execute on function public.restore_sleep_backup(jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
