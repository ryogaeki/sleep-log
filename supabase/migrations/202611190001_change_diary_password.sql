-- 日記の共通パスワードを変更できるようにします。
-- 202611180001_diary_display_lock.sql を適用したプロジェクトで、このファイル全体を実行します。
-- 既存のパスワード設定・日記本文・睡眠記録を変更、削除する処理はありません。
begin;
drop policy if exists note_lock_change on public.note_lock_settings;
create policy note_lock_change on public.note_lock_settings for update to authenticated
using (
  user_id = (select auth.uid())
  and exists (select 1 from public.app_members where user_id = (select auth.uid()))
)
with check (
  user_id = (select auth.uid())
  and exists (select 1 from public.app_members where user_id = (select auth.uid()))
);
-- 本人の照合値だけを更新できます。所有者ID・方式の版・他人の設定は変更できません。
grant update (salt, verifier) on public.note_lock_settings to authenticated;
notify pgrst, 'reload schema';
commit;
