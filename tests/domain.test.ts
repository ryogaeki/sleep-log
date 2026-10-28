import { test } from "node:test";
import assert from "node:assert/strict";
import { fromJst, dayOf, timeOf, shiftMonth, minutesOnDay, duration, summary, overlap, validateInput, type SleepEntry, type SleepInput } from "../src/lib/sleep";
import { makeBackup, parseBackup, planRestore } from "../src/lib/backup";
import { DemoRepository, DEMO_USER } from "../src/lib/repository";
const now = Date.parse("2026-10-18T12:00:00Z");
const id=(n:number)=>`aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12,"0")}`;
function entry(start:string,end:string,n=1):SleepEntry {
  return {id:id(n),user_id:DEMO_USER,start_at:start,end_at:end,kind:"normal",intention:"intentional",start_accuracy:"estimated",end_accuracy:"exact",record_timezone:"Asia/Tokyo",note:null,created_at:"2026-01-01T00:00:00Z",updated_at:"2026-01-01T00:00:00Z",revision:1};
}
test("日付またぎは1件を保持し、各日に実際の時間を配分する",()=>{
  const sleep=entry(fromJst("2026-10-17","23:00"),fromJst("2026-10-18","07:00"));
  assert.equal(duration(sleep),480);
  assert.equal(minutesOnDay(sleep,"2026-10-17"),60);
  assert.equal(minutesOnDay(sleep,"2026-10-18"),420);
  assert.equal(minutesOnDay(sleep,"2026-10-19"),0);
  assert.equal(sleep.start_at,"2026-10-17T14:00:00.000Z");
});
test("30時間の睡眠と0時終了を扱い、0時間のカードを出さない",()=>{
  const sleep=entry(fromJst("2026-10-16","18:00"),fromJst("2026-10-18","00:00"));
  assert.equal(duration(sleep),1800);
  assert.equal(minutesOnDay(sleep,"2026-10-16"),360);
  assert.equal(minutesOnDay(sleep,"2026-10-17"),1440);
  assert.equal(summary([sleep],"2026-10-18").records.length,0);
  assert.doesNotThrow(()=>validateInput(sleep,now));
});
test("通常睡眠・昼寝・長い寝落ちを同日に登録し、推定値も合計する",()=>{
  const values:[string,string,SleepInput["kind"]][]=[["02:00","08:00","normal"],["13:00","14:00","nap"],["17:00","23:30","doze"]];
  const entries=values.map(([a,b,kind],i)=>({...entry(fromJst("2026-10-17",a),fromJst("2026-10-17",b),i+1),kind}));
  const result=summary(entries,"2026-10-17");
  assert.equal(result.minutes,810);assert.equal(result.byKind.doze,390);assert.equal(result.estimated,true);assert.equal(result.records.length,3);
});
test("隣接は許可、重複は検出、編集時の自分自身は除外する",()=>{
  const a=entry(fromJst("2026-10-17","13:00"),fromJst("2026-10-17","14:00"));
  assert.equal(overlap(a,entry(fromJst("2026-10-17","14:00"),fromJst("2026-10-17","15:00"),2)),false);
  assert.equal(overlap(a,entry(fromJst("2026-10-17","13:30"),fromJst("2026-10-17","15:00"),2)),true);
  assert.equal(overlap(a,a),false);
});
test("端末のタイムゾーンに依存せず月境界と年越しを移動する",()=>{
  assert.equal(shiftMonth("2026-03-31",1),"2026-04-01");
  assert.equal(shiftMonth("2026-01-31",-1),"2025-12-01");
  assert.equal(dayOf("2026-10-17T22:00:00Z"),"2026-10-18");assert.equal(timeOf("2026-10-17T22:00:00Z"),"07:00");
});
test("不正日付、未来、終了以前、秒、長すぎるメモを拒否する",()=>{
  const valid=entry(fromJst("2026-10-17","02:00"),fromJst("2026-10-17","08:00"));
  assert.throws(()=>fromJst("2026-02-30","10:00"));
  assert.throws(()=>validateInput({...valid,start_at:"2026-02-30T02:00:00Z"},now));
  assert.throws(()=>validateInput({...valid,end_at:"2027-01-01T00:00:00Z"},now));
  assert.throws(()=>validateInput({...valid,end_at:valid.start_at},now));
  assert.throws(()=>validateInput({...valid,start_at:"2026-10-16T17:00:01Z"},now));
  assert.throws(()=>validateInput({...valid,note:"字".repeat(2001)},now));
  assert.doesNotThrow(()=>validateInput({...valid,note:"🌙".repeat(2000)},now));
});
test("種類と意図を独立して保持し、入力オブジェクトを変更しない",()=>{
  const raw=entry("2026-10-17T02:00:00+09:00","2026-10-17T08:00:00+09:00");
  const parsed=validateInput({...raw,intention:"unintentional"},now);
  assert.equal(parsed.intention,"unintentional");assert.equal(parsed.kind,"normal");assert.equal(raw.start_at,"2026-10-17T02:00:00+09:00");
});
test("バックアップは所有者情報を含めず、版・件数・重複IDを検証する",()=>{
  const data=makeBackup([entry(fromJst("2026-10-17","02:00"),fromJst("2026-10-17","08:00"))]);
  assert.equal("user_id" in data.entries[0],false);assert.equal(parseBackup(data,now).entries.length,1);
  assert.throws(()=>parseBackup({...data,version:2},now));assert.throws(()=>parseBackup({...data,count:9},now));
  assert.throws(()=>parseBackup({...data,count:2,entries:[data.entries[0],data.entries[0]]},now));
});
test("復元は現在の編集を守り、異なるIDの時間帯重複を検出する",()=>{
  const original=entry(fromJst("2026-10-17","02:00"),fromJst("2026-10-17","08:00"));
  const current={...original,note:"更新したメモ",revision:2};
  const plan=planRestore(makeBackup([original]),[current]);
  assert.equal(plan.additions.length,0);assert.equal(plan.changed.length,1);
  const collision=planRestore(makeBackup([{...original,id:id(2)}]),[current]);assert.equal(collision.collisions.length,1);
});
test("再試行で同じ記録が増えず、古い更新番号による上書き・削除を拒否する",async()=>{
  const repo=new DemoRepository([]);
  const raw=entry(fromJst("2026-10-17","02:00"),fromJst("2026-10-17","08:00"));
  const first=await repo.save(raw);await repo.save(raw);
  assert.equal((await repo.export()).count,1);
  await repo.save({...raw,note:"新しいメモ"},first.revision);
  await assert.rejects(repo.save({...raw,note:"古いメモ"},first.revision),{code:"conflict"});
  await assert.rejects(repo.remove(raw.id,first.revision),{code:"conflict"});
  assert.equal((await repo.get(raw.id))?.note,"新しいメモ");
});
test("復元時に衝突があれば一部だけ追加せず、同じファイルの再復元で増殖しない",async()=>{
  const original=entry(fromJst("2026-10-17","02:00"),fromJst("2026-10-17","08:00"));
  const repo=new DemoRepository([original]);
  const added=entry(fromJst("2026-10-16","02:00"),fromJst("2026-10-16","08:00"),2);
  const collision=entry(fromJst("2026-10-17","07:00"),fromJst("2026-10-17","09:00"),3);
  await assert.rejects(repo.restore(makeBackup([added,collision])));
  assert.equal((await repo.export()).count,1);
  assert.equal((await repo.restore(makeBackup([added]))).added,1);
  assert.equal((await repo.restore(makeBackup([added]))).added,0);
});
