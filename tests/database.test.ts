import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
const db=new PGlite({extensions:{btree_gist}});
const owner="11111111-1111-4111-8111-111111111111";
const other="22222222-2222-4222-8222-222222222222";
const stranger="33333333-3333-4333-8333-333333333333";
const id=(n:number)=>`bbbbbbbb-bbbb-4bbb-8bbb-${String(n).padStart(12,"0")}`;
async function asUser(user:string){await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${user}',false);`);}
async function reset(){await db.exec("reset role; truncate public.sleep_entries;");await asUser(owner);}
async function insert(n:number,start="2025-01-01T02:00:00Z",end="2025-01-01T08:00:00Z",user=owner){return db.query("insert into public.sleep_entries(id,user_id,start_at,end_at,kind,intention,start_accuracy,end_accuracy,note) values($1,$2,$3,$4,'normal','intentional','estimated','exact',null) returning *",[id(n),user,start,end]);}
before(async()=>{
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to authenticated,anon;
    insert into auth.users values('${owner}'),('${other}'),('${stranger}');`);
  await db.exec(await readFile(new URL("../supabase/migrations/202610180001_sleep_log.sql",import.meta.url),"utf8"));
  await db.query("insert into public.app_members values($1),($2)",[owner,other]);
});
after(async()=>{await db.close();});
test("本人だけのCRUDと、未許可・未ログイン・他人の所有者IDをDBで拒否",async()=>{
  await reset();await insert(1);
  await asUser(other);assert.equal((await db.query("select * from public.sleep_entries")).rows.length,0);
  await assert.rejects(insert(2,"2025-01-02T02:00:00Z","2025-01-02T08:00:00Z",owner),{code:"42501"});
  assert.equal((await db.query("delete from public.sleep_entries where id=$1 returning id",[id(1)])).rows.length,0);
  await asUser(stranger);await assert.rejects(insert(2,"2025-01-02T02:00:00Z","2025-01-02T08:00:00Z",stranger),{code:"42501"});
  await assert.rejects(db.query("select public.export_sleep_backup()"),{code:"42501"});
  await db.exec("reset role; set role anon;");await assert.rejects(db.query("select * from public.sleep_entries"),{code:"42501"});
});
test("本人の許可情報を書き換えたり、管理項目をフォームから変更したりできない",async()=>{
  await reset();await insert(1);
  await assert.rejects(db.query("insert into public.app_members values($1)",[stranger]),{code:"42501"});
  await assert.rejects(db.query("update public.sleep_entries set revision=99"),{code:"42501"});
  await assert.rejects(db.query("update public.sleep_entries set user_id=$1",[other]),{code:"42501"});
});
test("DBの排他制約で重複を拒否し、隣接と30時間の睡眠を許可",async()=>{
  await reset();await insert(1);
  await assert.rejects(insert(2,"2025-01-01T07:00:00Z","2025-01-01T09:00:00Z"),{code:"23P01"});
  await insert(2,"2025-01-01T08:00:00Z","2025-01-01T09:00:00Z");
  await insert(3,"2025-01-02T18:00:00Z","2025-01-04T00:00:00Z");
  assert.equal((await db.query("select * from public.sleep_entries")).rows.length,3);
});
test("DBでも未来・0分・秒単位・不正な属性を拒否",async()=>{
  await reset();
  await assert.rejects(insert(1,"2099-01-01T02:00:00Z","2099-01-01T08:00:00Z"),{code:"23514"});
  await assert.rejects(insert(2,"2025-01-01T02:00:00Z","2025-01-01T02:00:00Z"),{code:"23514"});
  await assert.rejects(insert(3,"2025-01-01T02:00:01Z","2025-01-01T08:00:00Z"),{code:"23514"});
  await insert(4);await assert.rejects(db.query("update public.sleep_entries set kind='invalid'"),{code:"23514"});
});
test("条件付き更新・削除で古い版の操作を拒み、DBが版を進める",async()=>{
  await reset();await insert(1);
  const changed=await db.query<{revision:number}>("update public.sleep_entries set note='PCで編集' where id=$1 and revision=1 returning revision",[id(1)]);
  assert.equal(changed.rows[0].revision,2);
  assert.equal((await db.query("update public.sleep_entries set note='iPhoneの古い入力' where id=$1 and revision=1 returning *",[id(1)])).rows.length,0);
  assert.equal((await db.query("delete from public.sleep_entries where id=$1 and revision=1 returning *",[id(1)])).rows.length,0);
});
test("全件バックアップは1000件を超えても欠けず、所有者・認証情報を含まない",async()=>{
  await reset();
  await db.query(`insert into public.sleep_entries(id,user_id,start_at,end_at,kind,intention,start_accuracy,end_accuracy)
    select ('cccccccc-cccc-4ccc-8ccc-'||lpad(n::text,12,'0'))::uuid,$1,
    '2020-01-01 00:00Z'::timestamptz+n*interval '2 minutes',
    '2020-01-01 00:01Z'::timestamptz+n*interval '2 minutes','nap','intentional','exact','exact' from generate_series(1,1005)n`,[owner]);
  const {rows}=await db.query<{backup:{count:number;entries:Record<string,unknown>[]}}>("select public.export_sleep_backup() as backup");
  assert.equal(rows[0].backup.count,1005);assert.equal(rows[0].backup.entries.length,1005);assert.equal("user_id" in rows[0].backup.entries[0],false);
});
test("復元は同じIDを上書きせず、同じファイルを何度入れても増えない",async()=>{
  await reset();await insert(1);
  const {rows}=await db.query<{backup:Record<string,unknown>}>("select public.export_sleep_backup() as backup");
  const backup=rows[0].backup;
  await db.query("update public.sleep_entries set note='現在のメモ' where id=$1",[id(1)]);
  const result=await db.query<{result:{added:number;kept:number;changed:number}}>("select public.restore_sleep_backup($1::jsonb) as result",[JSON.stringify(backup)]);
  assert.deepEqual(result.rows[0].result,{added:0,kept:1,changed:1});
  assert.equal((await db.query<{note:string}>("select note from public.sleep_entries")).rows[0].note,"現在のメモ");
  await db.query("delete from public.sleep_entries");
  await db.query("select public.restore_sleep_backup($1::jsonb)",[JSON.stringify(backup)]);
  await db.query("select public.restore_sleep_backup($1::jsonb)",[JSON.stringify(backup)]);
  assert.equal((await db.query("select * from public.sleep_entries")).rows.length,1);
});
test("復元の途中で衝突・不正があれば追加済みの分もロールバックする",async()=>{
  await reset();await insert(1);
  const {rows}=await db.query<{backup:{entries:Record<string,unknown>[]}}>("select public.export_sleep_backup() as backup");
  const original=rows[0].backup.entries[0];
  const backup={...rows[0].backup,count:2,entries:[{...original,id:id(2),start_at:"2025-01-02T02:00:00Z",end_at:"2025-01-02T08:00:00Z"},{...original,id:id(3)}]};
  await assert.rejects(db.query("select public.restore_sleep_backup($1::jsonb)",[JSON.stringify(backup)]),{code:"23P01"});
  assert.equal((await db.query("select * from public.sleep_entries")).rows.length,1);
});
