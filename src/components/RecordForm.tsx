"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { AppError, KINDS, INTENTIONS, KIND_LABEL, INTENTION_LABEL, DEFAULT_INTENTION, dayOf, timeOf, fromJst, shiftDay, duration, estimated, formatDuration, dateLabel, overlap, MINUTE, DAY, validateInput, type SleepEntry, type SleepInput } from "../lib/sleep";
import { initialForm, draftKey, clearDraft, type FormValues, type Draft } from "../lib/draft";
import type { Repository } from "../lib/repository";
import { Icon } from "./Icon";

export function RecordForm({ day, userId, entry, draft, repository, onClose, onSaved }: { day: string; userId:string; entry?:SleepEntry; draft?:Draft; repository:Repository; onClose:()=>void; onSaved:(message:string)=>void }) {
  const [values,setValues] = useState<FormValues>(()=>draft?.values ?? initialForm(day,entry));
  const [dirty,setDirty] = useState(Boolean(draft));
  const [error,setError] = useState("");
  const [errorCode,setErrorCode] = useState("");
  const [fieldErrors,setFieldErrors] = useState<Record<string,string>>({});
  const [busy,setBusy] = useState(false);
  const [draftWarning,setDraftWarning] = useState(false);
  const [latest,setLatest] = useState<SleepEntry | null | undefined>(undefined);
  const dialog = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  const saved = useRef(false);
  useEffect(()=>{const element=dialog.current;if(element){if(element.open)element.close();element.showModal();}return()=>{element?.close();};},[]);
  useEffect(()=>{if(Object.keys(fieldErrors).length)dialog.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus();},[fieldErrors]);
  useEffect(()=>{
    if (!dirty || saved.current) return;
    try { sessionStorage.setItem(draftKey(userId),JSON.stringify({userId,expiresAt:Date.now()+DAY,values})); }
    catch { setDraftWarning(true); }
  },[values,dirty,userId]);
  useEffect(()=>{
    const beforeUnload = (event: BeforeUnloadEvent)=>{ if (dirty && !saved.current) {event.preventDefault(); event.returnValue="";} };
    window.addEventListener("beforeunload",beforeUnload);
    return ()=>window.removeEventListener("beforeunload",beforeUnload);
  },[dirty]);
  function update(patch: Partial<FormValues>) { setValues(v=>({...v,...patch})); setDirty(true); setFieldErrors({}); setError(""); setErrorCode(""); setLatest(undefined); }
  function close() {
    if (lock.current) return;
    if (dirty && !window.confirm("未保存の変更を破棄して戻りますか？")) return;
    clearDraft(userId); onClose();
  }
  let preview: SleepInput | null = null;
  try {
    if (values.startTime && values.endTime) {
      const start_at=fromJst(values.startDate,values.startTime), end_at=fromJst(values.endDate,values.endTime);
      if (Date.parse(end_at)>Date.parse(start_at)) preview={id:values.id,start_at,end_at,kind:values.kind || "other",intention:values.intention,start_accuracy:values.startEstimated?"estimated":"exact",end_accuracy:values.endEstimated?"estimated":"exact",record_timezone:"Asia/Tokyo",note:values.note || null};
    }
  } catch {}
  const allocations: {day:string;minutes:number}[]=[];
  if (preview) {
    let d=dayOf(preview.start_at);
    for (let i=0;i<3 && fromJst(d)<preview.end_at;i++,d=shiftDay(d,1)) {
      const a=Date.parse(fromJst(d));
      allocations.push({day:d,minutes:(Math.min(Date.parse(preview.end_at),a+DAY)-Math.max(Date.parse(preview.start_at),a))/MINUTE});
    }
  }
  const moreDays=preview?Math.max(0,Math.ceil((Date.parse(preview.end_at)-Date.parse(fromJst(dayOf(preview.start_at))))/DAY)-3):0;
  async function save(event: FormEvent) {
    event.preventDefault(); if(lock.current) return;
    const missing:Record<string,string>={};
    if (!values.kind) missing.kind="睡眠の種類を選んでください。";
    for(const [key,label] of [["startDate","開始日"],["startTime","開始時刻"],["endDate","終了日"],["endTime","終了時刻"]]) if(!values[key as keyof FormValues]) missing[key]=`${label}を入力してください。`;
    if([...values.note].length>2000) missing.note="メモは2,000文字以内にしてください。";
    setFieldErrors(missing); setError(""); setErrorCode("");
    if(Object.keys(missing).length){ dialog.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus(); return; }
    lock.current=true;setBusy(true);
    try {
      const input=validateInput({id:values.id,start_at:fromJst(values.startDate,values.startTime),end_at:fromJst(values.endDate,values.endTime),kind:values.kind,intention:values.intention,start_accuracy:values.startEstimated?"estimated":"exact",end_accuracy:values.endEstimated?"estimated":"exact",record_timezone:"Asia/Tokyo",note:values.note || null});
      const current=await repository.list(dayOf(input.start_at),shiftDay(dayOf(input.end_at),1));
      const collision=current.find(e=>overlap(input,e));
      if(collision) {
        const minutes=(Math.min(Date.parse(input.end_at),Date.parse(collision.end_at))-Math.max(Date.parse(input.start_at),Date.parse(collision.start_at)))/MINUTE;
        throw new AppError("overlap",`${KIND_LABEL[collision.kind]}（${dateLabel(dayOf(collision.start_at))} ${timeOf(collision.start_at)}〜${dateLabel(dayOf(collision.end_at))} ${timeOf(collision.end_at)}）と${formatDuration(minutes)}重なっています。日時を修正してください。`);
      }
      await repository.save(input,values.revision);
      saved.current=true; clearDraft(userId); onSaved(values.revision?"記録を更新しました。":"睡眠を記録しました。");
    } catch(e) { setError(e instanceof Error?e.message:"保存できませんでした。入力は残っています。"); setErrorCode(e instanceof AppError?e.code:"network"); }
    finally {lock.current=false;setBusy(false);}
  }
  async function remove() {
    if(lock.current || !values.revision || !entry) return;
    if(!window.confirm(`${KIND_LABEL[entry.kind]}\n${dateLabel(dayOf(entry.start_at))} ${timeOf(entry.start_at)}〜${dateLabel(dayOf(entry.end_at))} ${timeOf(entry.end_at)}\n${formatDuration(duration(entry))}\nこの記録を削除しますか？ 元に戻すことはできません。`)) return;
    lock.current=true; setBusy(true); setError("");
    try {await repository.remove(values.id,values.revision); saved.current=true; clearDraft(userId); onSaved("記録を削除しました。");}
    catch(e) {setError(e instanceof Error?e.message:"削除できませんでした。");setErrorCode(e instanceof AppError?e.code:"network");}
    finally {lock.current=false;setBusy(false);}
  }
  async function getLatest() {
    setBusy(true); lock.current=true;
    try {setLatest(await repository.get(values.id));} catch(e){setError(e instanceof Error?e.message:"最新の記録を取得できませんでした。");}
    finally{setBusy(false);lock.current=false;}
  }
  return <dialog ref={dialog} className="record-dialog" aria-labelledby="record-title" onCancel={e=>{e.preventDefault();close();}}>
    <form onSubmit={save} noValidate>
      <header className="dialog-heading"><div><p className="eyebrow">SLEEP RECORD</p><h2 id="record-title">{values.revision?"睡眠を編集":"睡眠を追加"}</h2></div><button type="button" className="icon-button" onClick={close} disabled={busy} aria-label="閉じる"><Icon name="close"/></button></header>
      <div className="dialog-content"><p className="form-intro">夜の睡眠も、昼寝も、寝落ちも。<br/>思い出したときに、そのまま記録できます。</p>
      <fieldset disabled={busy} className="form-fields">
        <div className="field-block"><label id="kind-label">睡眠の種類 <span className="required">必須</span></label><div className="kind-options" role="group" aria-labelledby="kind-label">{KINDS.map(kind=><button key={kind} type="button" aria-pressed={values.kind===kind} aria-invalid={Boolean(fieldErrors.kind)} className={`kind-option ${kind} ${values.kind===kind?"active":""}`} onClick={()=>update({kind,...(!values.intentionTouched?{intention:DEFAULT_INTENTION[kind]}:{})})}><Icon name={kind==="normal"?"moon":kind==="nap"?"sun":kind==="doze"?"spark":"clock"}/>{KIND_LABEL[kind]}</button>)}</div>{fieldErrors.kind&&<p className="field-error">{fieldErrors.kind}</p>}</div>
        {(["start","end"] as const).map(side=>{
          const isStart=side==="start";const dk=isStart?"startDate":"endDate",tk=isStart?"startTime":"endTime",ek=isStart?"startEstimated":"endEstimated";
          return <div className="time-block" key={side}><div className="field-heading"><label htmlFor={`${side}-date`}>{isStart?"眠り始めた日時":"起きた日時"} <span className="required">必須</span></label><button type="button" className="text-button" onClick={()=>{try{update({[dk]:shiftDay(values[dk],isStart?-1:1)});}catch{setError("日付を選択してください。");}}}>{isStart?"前日にする":"翌日にする"}</button></div><div className="datetime-row"><div><input id={`${side}-date`} type="date" value={values[dk]} onChange={e=>update({[dk]:e.target.value})} aria-label={isStart?"開始日":"終了日"} aria-invalid={Boolean(fieldErrors[dk])}/>{fieldErrors[dk]&&<p className="field-error">{fieldErrors[dk]}</p>}</div><div><input id={`${side}-time`} type="time" step="60" value={values[tk]} onChange={e=>update({[tk]:e.target.value})} aria-label={isStart?"開始時刻":"終了時刻"} aria-invalid={Boolean(fieldErrors[tk])}/>{fieldErrors[tk]&&<p className="field-error">{fieldErrors[tk]}</p>}</div></div><div className="time-tools"><label className="checkbox-label"><input type="checkbox" checked={values[ek]} onChange={e=>update({[ek]:e.target.checked})}/><span>時刻は推定</span></label>{!isStart&&<button type="button" className="now-button" onClick={()=>{const now=new Date();update({endDate:dayOf(now),endTime:timeOf(now),endEstimated:false});}}><Icon name="clock" size={15}/>終了を今にする</button>}</div></div>;
        })}
        <div className="field-block"><label id="intention-label">眠った意図</label><div className="segmented" role="group" aria-labelledby="intention-label">{INTENTIONS.map(intention=><button key={intention} type="button" aria-pressed={values.intention===intention} className={values.intention===intention?"active":""} onClick={()=>update({intention,intentionTouched:true})}>{INTENTION_LABEL[intention]}</button>)}</div></div>
        <details className="note-field" open={values.note?true:undefined}><summary>メモ <span>任意</span><Icon name="plus" size={17}/></summary><textarea aria-label="メモ" rows={3} value={values.note} onChange={e=>update({note:e.target.value})} placeholder="眠っていた場所や、起きたときの様子など" aria-invalid={Boolean(fieldErrors.note)}/><div className="character-count">{[...values.note].length.toLocaleString()} / 2,000文字</div>{fieldErrors.note&&<p className="field-error">{fieldErrors.note}</p>}</details>
      </fieldset>
      {preview&&<div className="duration-preview"><div><span>記録する睡眠時間</span><strong>{estimated(preview)?"約":""}{formatDuration(duration(preview))}</strong></div><p>{allocations.map(a=>`${dateLabel(a.day)}に${formatDuration(a.minutes)}`).join("、")}{moreDays>0?`、ほか${moreDays}日`:""}{estimated(preview)?"（推定を含む）":""}</p></div>}
      {error&&<div className="notice error" role="alert"><Icon name="info"/><div>{error}<small>入力はこの画面に残っています。</small>{errorCode==="conflict"&&<button type="button" className="text-button" disabled={busy} onClick={getLatest}>最新の記録を確認</button>}</div></div>}
      {latest!==undefined&&<div className="latest-record"><strong>保存先の最新の記録</strong>{latest?<><p>{KIND_LABEL[latest.kind]} · {dateLabel(dayOf(latest.start_at))} {timeOf(latest.start_at)}〜{dateLabel(dayOf(latest.end_at))} {timeOf(latest.end_at)}</p><p className="note-text">{latest.note}</p><button type="button" className="text-button" onClick={()=>{if(!window.confirm("現在の入力を破棄し、最新の内容に切り替えますか？"))return;setValues(initialForm(day,latest));setDirty(false);clearDraft(userId);setLatest(undefined);setError("");}}>最新の内容に切り替える</button></>:<p>このIDの記録は保存されていません。現在の入力は変更していません。</p>}</div>}
      {draftWarning&&<p className="field-error">一時保存を利用できません。この画面を閉じる前に記録を保存してください。</p>}
      <p className="form-footnote">日時はすべて日本時間です。</p>
      {values.revision&&entry&&<button type="button" className="delete-button" disabled={busy} onClick={remove}><Icon name="trash" size={17}/>この記録を削除する</button>}
      </div>
      <footer className="dialog-footer"><button type="submit" disabled={busy} className="button primary save-button">{busy?<><Icon name="refresh" className="spinning"/>保存先を確認中…</>:<><Icon name="check"/>保存する</>}</button></footer>
    </form>
  </dialog>;
}
