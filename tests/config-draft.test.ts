import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePublicConfig } from "../src/lib/public-config";
import { initialForm, readDraft, draftKey } from "../src/lib/draft";
test("接続設定は公開用キーだけを許可し、管理用キーを拒否する",()=>{
  const url="https://example.supabase.co";
  const legacy=(role:string)=>`header.${btoa(JSON.stringify({role}))}.signature`;
  assert.equal(validatePublicConfig("",""),false);
  assert.equal(validatePublicConfig(url,"sb_publishable_example"),true);
  assert.equal(validatePublicConfig(url,legacy("anon")),true);
  assert.throws(()=>validatePublicConfig(url,"sb_secret_example"));
  assert.throws(()=>validatePublicConfig(url,legacy("service_role")));
  assert.throws(()=>validatePublicConfig("http://remote.example.com","sb_publishable_example"));
  assert.throws(()=>validatePublicConfig(url,""));
});
test("未保存の入力は本人と24時間の期限を確認して復元する",()=>{
  const store=new Map<string,string>();
  Object.defineProperty(globalThis,"sessionStorage",{configurable:true,value:{getItem:(key:string)=>store.get(key)??null,setItem:(key:string,value:string)=>store.set(key,value),removeItem:(key:string)=>store.delete(key)}});
  const values=initialForm("2026-10-17");
  store.set(draftKey("self"),JSON.stringify({userId:"self",expiresAt:Date.now()+60_000,values}));
  assert.equal(readDraft("self")?.values.id,values.id);assert.equal(readDraft("other"),null);
  store.set(draftKey("self"),JSON.stringify({userId:"self",expiresAt:Date.now()-1,values}));
  assert.equal(readDraft("self"),null);assert.equal(store.has(draftKey("self")),false);
});
