"use client";
import { useRef, useState } from "react";
import { parseBackup, planRestore, type Backup } from "../lib/backup";
import { dayOf, timeOf, dateLabel, KIND_LABEL } from "../lib/sleep";
import type { Repository } from "../lib/repository";
import { Icon } from "./Icon";
export function DataPanel({repository,demo,onRestored,onLogout}:{repository:Repository;demo:boolean;onRestored:(message:string)=>void;onLogout:()=>void}) {
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const [preview,setPreview]=useState<{backup:Backup;plan:ReturnType<typeof planRestore>;name:string}|null>(null);
  const file=useRef<HTMLInputElement>(null);
  const lock=useRef(false);
  async function exportFile() {
    if(lock.current)return;lock.current=true;setBusy(true);setError("");setMessage("");
    try {
      const backup=await repository.export();
      const blob=new Blob([JSON.stringify(backup,null,2)],{type:"application/json"});
      const url=URL.createObjectURL(blob);const a=document.createElement("a");
      const now=new Date();a.href=url;a.download=`sleep-log-${demo?"demo-":""}backup-${dayOf(now).replaceAll("-","")}-${timeOf(now).replace(":","")}00.json`;
      document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
      setMessage(`${backup.count}件のバックアップを書き出しました。選んだ保存先を確認してください。`);
    }catch(e){setError(e instanceof Error?e.message:"バックアップを取得できませんでした。");}
    finally{lock.current=false;setBusy(false);}
  }
  async function inspectFile(selected?:File) {
    if(!selected || lock.current)return;lock.current=true;setBusy(true);setError("");setMessage("");setPreview(null);
    try {const backup=parseBackup(JSON.parse(await selected.text()));const current=await repository.export();setPreview({backup,plan:planRestore(backup,current.entries),name:selected.name});}
    catch(e){setError(e instanceof SyntaxError?"JSONファイルを読み取れませんでした。Sleep Logのバックアップを選んでください。":e instanceof Error?e.message:"ファイルを確認できませんでした。");}
    finally{lock.current=false;setBusy(false);if(file.current)file.current.value="";}
  }
  async function restore() {
    if(!preview || preview.plan.collisions.length || lock.current)return;
    lock.current=true;setBusy(true);setError("");
    try {const result=await repository.restore(preview.backup);setPreview(null);setMessage(`${result.added}件を復元しました。既存の${result.kept}件は変更していません。`);onRestored(`${result.added}件の記録を復元しました。`);}
    catch(e){setError(e instanceof Error?e.message:"復元できませんでした。記録は変更していません。");}
    finally{lock.current=false;setBusy(false);}
  }
  return <div className="data-panel">
    <div className="section-heading"><div><p className="eyebrow">YOUR DATA</p><h1>大切な記録を、手元にも。</h1><p>バックアップを残して、記録を長くつなげましょう。</p></div></div>
    {demo&&<div className="notice"><Icon name="info"/><p>体験用のデータを操作しています。書き出すファイルもサンプルの記録です。</p></div>}
    <div className="data-cards"><section className="panel data-card"><div className="feature-icon"><Icon name="download" size={25}/></div><h2>バックアップを書き出す</h2><p>保存されているすべての睡眠記録を、復元できるJSONファイルで保存します。</p><button className="button primary" type="button" disabled={busy} onClick={exportFile}><Icon name={busy?"refresh":"download"} size={18}/>バックアップを書き出す</button><small>ファイルには睡眠時刻やメモが含まれます。<br/>自分が管理できる場所に保管してください。</small></section>
    <section className="panel data-card"><div className="feature-icon pale"><Icon name="upload" size={25}/></div><h2>バックアップから復元する</h2><p>以前に保存したファイルから、不足している記録を追加します。現在の記録は上書きしません。</p><button className="button secondary" type="button" disabled={busy} onClick={()=>file.current?.click()}><Icon name="upload" size={18}/>ファイルを選ぶ</button><input ref={file} type="file" accept=".json,application/json" aria-label="復元するバックアップファイル" className="visually-hidden" onChange={e=>inspectFile(e.target.files?.[0])}/><small>CSV・PDFでの出力は、今後追加する予定です。</small></section></div>
    {error&&<div className="notice error" role="alert"><Icon name="info"/><p>{error}</p></div>}
    {message&&<div className="notice success" role="status"><Icon name="check"/><p>{message}</p></div>}
    {preview&&<section className="panel restore-preview"><p className="eyebrow">RESTORE PREVIEW</p><h2>復元する内容を確認</h2><p className="filename">{preview.name}</p><div className="restore-counts"><div><strong>{preview.plan.additions.length}</strong><span>追加する記録</span></div><div><strong>{preview.plan.existing}</strong><span>既存のまま残す記録</span></div></div>
      {preview.plan.changed.length>0&&<div className="notice"><Icon name="info"/><div><p>{preview.plan.changed.length}件は現在の記録と内容が異なります。現在の内容を残します。</p><ul className="restore-list">{preview.plan.changed.slice(0,5).map(e=><li key={e.id}>{KIND_LABEL[e.kind]} · {dateLabel(dayOf(e.start_at))} {timeOf(e.start_at)}</li>)}</ul>{preview.plan.changed.length>5&&<p>ほか{preview.plan.changed.length-5}件</p>}</div></div>}
      {preview.plan.collisions.length>0?<div className="notice error" role="alert"><Icon name="info"/><div><p>現在の記録と時間帯が重なるため、復元できません。</p><ul className="restore-list">{preview.plan.collisions.slice(0,5).map((c,i)=><li key={i}>{KIND_LABEL[c.incoming.kind]} {dateLabel(dayOf(c.incoming.start_at))} {timeOf(c.incoming.start_at)}〜{timeOf(c.incoming.end_at)} が、{KIND_LABEL[c.current.kind]} {dateLabel(dayOf(c.current.start_at))} {timeOf(c.current.start_at)}〜{timeOf(c.current.end_at)} と重複</li>)}</ul></div></div>:<p className="muted">現在の記録を削除せず、追加分をまとめて復元します。</p>}
      <div className="row wrap gap-3"><button type="button" className="button primary" onClick={restore} disabled={busy || !preview.plan.additions.length || preview.plan.collisions.length>0}>{busy?"復元中…":`${preview.plan.additions.length}件を復元する`}</button><button type="button" className="button secondary" disabled={busy} onClick={()=>setPreview(null)}>キャンセル</button></div></section>}
    <section className="panel storage-card"><div><Icon name={demo?"info":"cloud"}/><div><h2>{demo?"体験モード":"クラウド保存"}</h2><p>{demo?"変更はこのタブだけに一時保存されます。本番の記録にはなりません。":"記録はログインした本人だけがアクセスできます。日時は日本時間です。"}</p></div></div><button className="text-button logout-button" type="button" disabled={busy} onClick={onLogout}><Icon name="logout" size={17}/>{demo?"体験を終了する":"ログアウト"}</button></section>
  </div>;
}
