"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase, configured, signIn } from "../lib/supabase";
import { CloudRepository, DEMO_USER, type Repository, dbError } from "../lib/repository";
import { startDemo, DEMO_STORAGE } from "../lib/demo";
import { readDraft, clearDraft, type Draft } from "../lib/draft";
import { dayOf, shiftDay, shiftMonth, dateLabel, timeOf, summary, duration, minutesOnDay, estimated, formatDuration, KIND_LABEL, INTENTION_LABEL, KINDS, type SleepEntry } from "../lib/sleep";
import { Icon, type IconName } from "./Icon";
import { Calendar } from "./Calendar";
import { RecordForm } from "./RecordForm";
import { DataPanel } from "./DataPanel";
import { AnalysisPanel } from "./AnalysisPanel";

type View="day"|"calendar"|"analysis"|"data";
type Access="loading"|"unconfigured"|"signedOut"|"forbidden"|"error"|"ready";
const NAV:{view:View;label:string;icon:IconName}[]=[{view:"day",label:"日別の記録",icon:"moon"},{view:"calendar",label:"カレンダー",icon:"calendar"},{view:"analysis",label:"分析",icon:"chart"},{view:"data",label:"データ管理",icon:"settings"}];

export default function SleepApp() {
  const [access,setAccess]=useState<Access>("loading");
  const [session,setSession]=useState<Session|null>(null);
  const [repository,setRepository]=useState<Repository|null>(null);
  const [demo,setDemo]=useState(false);
  const [view,setView]=useState<View>("day");
  const [selected,setSelected]=useState("");
  const [entries,setEntries]=useState<SleepEntry[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [refresh,setRefresh]=useState(0);
  const [editor,setEditor]=useState<{entry?:SleepEntry;draft?:Draft}|null>(null);
  const [pendingDraft,setPendingDraft]=useState<Draft|null>(null);
  const [authRefresh,setAuthRefresh]=useState(0);
  const [authBusy,setAuthBusy]=useState(false);
  const generation=useRef(0);
  const demoRef=useRef(false);
  const currentUser=useRef<string|null>(null);
  const userId=demo?DEMO_USER:session?.user.id??"";
  // 月境界をまたぐ週と、カレンダーの前後の日付も同じ取得範囲で扱う。
  const windowFirst=selected?shiftMonth(selected,-1):"";
  const windowUntil=selected?shiftMonth(selected,2):"";
  useEffect(()=>{setSelected(dayOf(new Date()));},[]);
  useEffect(()=>{
    let active=true;let check=0;
    let sb:ReturnType<typeof getSupabase>;
    try{sb=getSupabase();}catch{setAccess("error");setError("保存先の接続設定を確認できませんでした。公開用のURLとキーを確認してください。");return;}
    if(!sb){setAccess("unconfigured");return;}
    const client=sb;
    async function accept(next:Session|null) {
      if(!active || demoRef.current)return;
      const ticket=++check;
      if(!next){currentUser.current=null;setSession(null);setEntries([]);setRepository(null);setEditor(null);setAccess("signedOut");return;}
      if(currentUser.current===next.user.id){setSession(next);return;}
      setAccess("loading");setError("");
      const {data,error}=await client.from("app_members").select("user_id").eq("user_id",next.user.id).maybeSingle();
      if(!active || ticket!==check || demoRef.current)return;
      setSession(next);
      if(error){setAccess("error");setError("保存先の設定または接続を確認できませんでした。DB設定と通信状況を確認してください。");return;}
      if(!data){setAccess("forbidden");setRepository(null);setEntries([]);return;}
      currentUser.current=next.user.id;setRepository(new CloudRepository(client,next.user.id));setAccess("ready");setPendingDraft(readDraft(next.user.id));
    }
    client.auth.getSession().then(({data,error})=>{if(!active)return;if(error){setAccess("error");setError(dbError(error).message);}else void accept(data.session);});
    const {data:subscription}=client.auth.onAuthStateChange((_event,next)=>{queueMicrotask(()=>void accept(next));});
    return()=>{active=false;subscription.subscription.unsubscribe();};
  },[authRefresh]);
  const reload=useCallback(()=>setRefresh(n=>n+1),[]);
  useEffect(()=>{
    if(!repository || !windowFirst || !windowUntil || access!=="ready")return;
    const ticket=++generation.current;setLoading(true);setError("");setEntries([]);
    repository.list(windowFirst,windowUntil).then(data=>{if(ticket===generation.current)setEntries(data);}).catch(e=>{if(ticket===generation.current)setError(e instanceof Error?e.message:"記録を読み込めませんでした。");}).finally(()=>{if(ticket===generation.current)setLoading(false);});
    return()=>{generation.current++;};
  },[repository,windowFirst,windowUntil,refresh,access]);
  useEffect(()=>{
    const onFocus=()=>{if(document.visibilityState==="visible")reload();};
    window.addEventListener("focus",onFocus);document.addEventListener("visibilitychange",onFocus);
    return()=>{window.removeEventListener("focus",onFocus);document.removeEventListener("visibilitychange",onFocus);};
  },[reload]);
  useEffect(()=>{if(!notice)return;const timeout=setTimeout(()=>setNotice(""),5000);return()=>clearTimeout(timeout);},[notice]);
  function enterDemo() {
    demoRef.current=true;currentUser.current=null;setDemo(true);setRepository(startDemo());setSession(null);setAccess("ready");setSelected(shiftDay(dayOf(new Date()),-1));setView("day");setError("");setPendingDraft(readDraft(DEMO_USER));
  }
  async function login() {
    setAuthBusy(true);setError("");
    try{await signIn();}catch{setError("ログインを開始できませんでした。通信状況とログイン設定を確認してください。");setAuthBusy(false);}
  }
  async function logout() {
    if(!window.confirm(demo?"体験モードを終了しますか？ 体験用の変更は消去されます。":"この端末からログアウトしますか？"))return;
    if(!demo){const sb=getSupabase();if(sb){const {error}=await sb.auth.signOut({scope:"local"});if(error){setError("ログアウトできませんでした。もう一度お試しください。");return;}}}
    clearDraft(userId);if(demo)sessionStorage.removeItem(DEMO_STORAGE);
    demoRef.current=false;currentUser.current=null;setDemo(false);setRepository(null);setEntries([]);setPendingDraft(null);setEditor(null);setSession(null);setError("");setAccess(configured?"signedOut":"unconfigured");setAuthRefresh(n=>n+1);
  }
  function openEditor(entry?:SleepEntry) {
    if(!repository)return;
    const existing=readDraft(userId);
    if(existing&&!window.confirm("未保存の入力があります。破棄して別の記録を開きますか？"))return;
    clearDraft(userId);setPendingDraft(null);setEditor(entry?{entry}:{});
  }
  function selectDate(day:string,changeView=false){setSelected(day);if(changeView)setView("day");}
  const today=dayOf(new Date());
  const totals=selected?summary(entries,selected):{records:[],minutes:0,estimated:false,byKind:{normal:0,nap:0,doze:0,other:0}};
  const name=demo?"体験モード":session?.user.user_metadata?.user_name??session?.user.user_metadata?.preferred_username??"マイアカウント";
  return <div className="app-shell">
    <aside className="sidebar"><a className="brand" href={`${process.env.NEXT_PUBLIC_BASE_PATH??""}/`} aria-label="Sleep Log ホーム"><span className="brand-mark"><Icon name="moon" size={24}/></span><span>sleep log<span className="brand-sub">わたしの睡眠記録</span></span></a><div className="sidebar-divider"/><p className="nav-caption">MY JOURNAL</p><nav aria-label="メインナビゲーション">{NAV.map(item=><button type="button" key={item.view} className={`nav-item ${view===item.view?"active":""}`} disabled={access!=="ready"} onClick={()=>setView(item.view)}><Icon name={item.icon}/>{item.label}{view===item.view&&<span className="nav-indicator"/>}</button>)}</nav>
    <div className="sidebar-note"><span className="small-star">✦</span><p>ひとつひとつの記録が、<br/>自分を知る手がかりに。</p><span>YOUR SLEEP, YOUR PACE.</span></div>
    <div className="sidebar-bottom"><span className={`connection-dot ${access==="ready"&&!demo?"online":""}`}/>{demo?"サンプルデータで体験中":access==="ready"?"クラウドに接続中":"あなたのペースで記録"}</div></aside>
    <div className="workspace"><header className="topbar"><div className="mobile-brand"><span className="brand-mark"><Icon name="moon" size={20}/></span><span>sleep log</span></div><span className="topbar-title">睡眠のリズムを、少しずつ知る。</span><div className="account"><span className="timezone">日本時間</span><span className="avatar">{demo?"S":String(name).slice(0,1).toUpperCase()}</span><span className="account-name">{name}</span></div></header>
    <main id="main-content">
    {access==="loading"?<div className="loading-screen" role="status"><Icon name="moon" size={36}/><p>記録をひらいています…</p></div>:access!=="ready"?<section className="welcome"><div className="welcome-art"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><Icon name="moon" size={72}/><span className="art-star one">✦</span><span className="art-star two">✧</span></div><p className="eyebrow">YOUR SLEEP, YOUR PACE.</p><h1>眠った時間を、<br/>あなたのペースで。</h1><p className="welcome-copy">夜の睡眠も、昼寝も、思いがけない寝落ちも。<br/>いつでも、何回でも。思い出したときに記録しましょう。</p>
    {access==="unconfigured"?<><div className="welcome-notice"><Icon name="info" size={18}/><span>クラウド保存は準備中です。<br/>サンプルの記録で、使い心地を体験できます。</span></div><button type="button" className="button primary large" onClick={enterDemo}><Icon name="spark"/>画面を体験する<Icon name="right" size={18}/></button></>:access==="forbidden"?<><div className="notice error" role="alert"><Icon name="info"/><p>このアカウントには利用許可がありません。本人用の設定を完了してから、もう一度確認してください。</p></div><div className="row gap-3 wrap"><button className="button primary" onClick={()=>{currentUser.current=null;setAuthRefresh(n=>n+1);}}>利用許可を再確認</button><button className="button secondary" onClick={logout}>ログアウト</button></div></>:<><button type="button" className="button primary large" onClick={login} disabled={authBusy}><Icon name="github"/>{authBusy?"ログインに移動中…":"GitHubでログイン"}</button>{access==="error"&&<button type="button" className="text-button" onClick={()=>{currentUser.current=null;setAuthRefresh(n=>n+1);}}>接続を再確認する</button>}<button type="button" className="text-button demo-link" onClick={enterDemo}>サンプルで体験する<Icon name="right" size={15}/></button></>}
    {error&&<div className="notice error" role="alert">{error}</div>}<div className="welcome-features"><span><Icon name="plus" size={16}/>1日何回でも</span><span><Icon name="clock" size={16}/>あとから記録</span><span><Icon name="cloud" size={16}/>自分だけの記録</span></div></section>:<>
      {demo&&<div className="demo-banner"><div><Icon name="spark" size={16}/><strong>体験モード</strong><span>サンプルの記録です。変更はこのタブ内だけに保存されます。</span></div><button type="button" onClick={logout}>体験を終了<Icon name="close" size={14}/></button></div>}
      {pendingDraft&&<div className="notice draft-notice"><Icon name="pencil"/><div>未保存の入力があります。<button type="button" className="text-button" onClick={()=>{setEditor({draft:pendingDraft});setPendingDraft(null);}}>入力を再開する</button><button type="button" className="text-button muted" onClick={()=>{if(window.confirm("未保存の入力を破棄しますか？")){clearDraft(userId);setPendingDraft(null);}}}>破棄</button></div></div>}
      {notice&&<div className="toast" role="status"><Icon name="check" size={18}/>{notice}</div>}
      {error&&<div className="notice error" role="alert"><Icon name="info"/><div>{error}<button type="button" className="text-button" onClick={reload}>もう一度読み込む</button></div></div>}
      {view==="analysis"?<AnalysisPanel entries={entries} selected={selected} loading={loading} error={error} onSelect={selectDate} onEdit={openEditor}/>:view==="data"&&repository?<DataPanel repository={repository} demo={demo} onRestored={message=>{setNotice(message);reload();}} onLogout={logout}/>:view==="calendar"?<div className="calendar-page"><div className="section-heading"><div><p className="eyebrow">SLEEP CALENDAR</p><h1>カレンダー</h1><p>眠った時間を、日々の流れで。</p></div><button type="button" className="button primary" onClick={()=>openEditor()}><Icon name="plus"/>睡眠を追加</button></div><div className={`panel ${loading?"is-loading":""}`}><Calendar selected={selected} entries={entries} onSelect={d=>selectDate(d,true)} onMonth={setSelected}/></div><div className="calendar-legend">{KINDS.map(k=><span key={k}><i className={`dot ${k}`}/>{KIND_LABEL[k]}</span>)}<span>— 未記録</span></div><p className="calendar-help">日付を選ぶと、その日の記録を確認・編集できます。推定時刻を含む合計には「約」を表示します。</p></div>:<div className="daily-layout"><div className="daily-main"><div className="section-heading"><div><p className="eyebrow">MY SLEEP JOURNAL</p><h1>{selected===today?"今日の睡眠":`${Number(selected.slice(5,7))}月${Number(selected.slice(-2))}日の記録`}</h1><p>眠りのひとつひとつを、ありのままに。</p></div><button type="button" className="button primary add-top" onClick={()=>openEditor()}><Icon name="plus" size={18}/>睡眠を追加</button></div>
        <div className="date-toolbar"><div className="row gap-2"><button type="button" className="icon-button" aria-label="前の日" onClick={()=>selectDate(shiftDay(selected,-1))}><Icon name="left" size={18}/></button><button type="button" className="date-title" onClick={()=>setView("calendar")}><Icon name="calendar" size={17}/>{selected?dateLabel(selected,true):""}</button><button type="button" className="icon-button" aria-label="次の日" onClick={()=>selectDate(shiftDay(selected,1))}><Icon name="right" size={18}/></button></div>{selected!==today&&<button type="button" className="today-button" onClick={()=>selectDate(today)}>今日</button>}</div>
        <section className={`summary-card ${loading?"is-loading":""}`} aria-label="この日の記録合計"><div className="summary-top"><span><Icon name="moon" size={17}/>記録合計</span><span className="record-count">{loading?"読込中":`${totals.records.length}回の睡眠`}</span></div><div className="summary-total">{loading?<span className="total-empty">…</span>:error?<span className="total-empty">—</span>:totals.records.length?<>{totals.estimated&&<span className="approx">約</span>}<strong>{Math.floor(totals.minutes/60)}</strong><span>時間</span><strong>{totals.minutes%60}</strong><span>分</span></>:<span className="total-empty">—</span>}</div><p className="summary-caption">{error?"記録を取得できませんでした":totals.records.length?totals.estimated?"推定の時刻を含む、記録された睡眠の合計です。":"記録された睡眠の合計です。":"この日の睡眠は、まだ記録されていません。"}</p><div className="summary-divider"/><div className="kind-summary">{KINDS.slice(0,3).map(kind=><div key={kind}><span><i className={`dot ${kind}`}/>{KIND_LABEL[kind]}</span><strong>{totals.byKind[kind]?formatDuration(totals.byKind[kind]):"—"}</strong></div>)}</div><div className="summary-moon"><Icon name="moon" size={105}/></div></section>
        <section className="records-section"><div className="records-heading"><h2>睡眠の記録 <span>{totals.records.length}</span></h2><button type="button" className="text-button" onClick={reload} disabled={loading}><Icon name="refresh" size={15} className={loading?"spinning":""}/>更新</button></div>
        {loading?<div className="panel empty-records" role="status">記録を読み込んでいます…</div>:error?<div className="panel empty-records"><Icon name="cloud" size={30}/><h3>記録を表示できません</h3><p>通信状況を確認して、もう一度読み込んでください。</p></div>:totals.records.length?<div className="record-list">{totals.records.map(record=><button type="button" key={record.id} className={`record-card ${record.kind}`} onClick={()=>openEditor(record)} aria-label={`${KIND_LABEL[record.kind]} ${timeOf(record.start_at)}から${timeOf(record.end_at)} 編集`}><span className="record-icon"><Icon name={record.kind==="normal"?"moon":record.kind==="nap"?"sun":record.kind==="doze"?"spark":"clock"} size={22}/></span><span className="record-content"><span className="record-top"><strong>{KIND_LABEL[record.kind]}</strong><span className={`tag ${record.intention==="unintentional"?"unintentional":""}`}>{INTENTION_LABEL[record.intention]}</span></span><span className="record-times">{dayOf(record.start_at)!==selected&&<small>{dayOf(record.start_at)<selected?"前日以前から ":`${dateLabel(dayOf(record.start_at))} `}</small>}{timeOf(record.start_at)}<span className="time-dash">—</span>{timeOf(record.end_at)}{dayOf(record.end_at)!==selected&&<small> 翌日以降まで</small>}{estimated(record)&&<span className="estimated-tag">推定を含む</span>}</span>{record.note&&<span className="record-note">{record.note}</span>}</span><span className="record-duration"><strong>{estimated(record)?"約":""}{formatDuration(duration(record))}</strong>{minutesOnDay(record,selected)!==duration(record)&&<small>この日の分 {formatDuration(minutesOnDay(record,selected))}</small>}<Icon name="right" size={17}/></span></button>)}</div>:<div className="panel empty-records"><div className="empty-moon"><Icon name="moon" size={31}/></div><h3>この日の眠りを記録しましょう</h3><p>昼寝も、寝落ちも、あとからで大丈夫。<br/>短い睡眠も、そのまま残せます。</p><button type="button" className="button secondary" onClick={()=>openEditor()}><Icon name="plus" size={17}/>最初の記録を追加</button></div>}
        <button type="button" className="add-record-dashed" onClick={()=>openEditor()}><Icon name="plus" size={18}/>睡眠を追加する</button></section><p className="daily-footnote"><Icon name="info" size={14}/>合計は日本時間の0:00で区切って計算しています。</p>
      </div><aside className="daily-aside"><div className={`panel ${loading?"is-loading":""}`}><Calendar compact selected={selected} entries={entries} onSelect={d=>selectDate(d)} onMonth={setSelected}/></div><section className="gentle-note"><span className="note-orbit"><Icon name="spark" size={22}/></span><p className="eyebrow">A LITTLE REMINDER</p><h3>正確じゃなくても、<br/>残しておくことから。</h3><p>眠り始めた時間が分からないときは、<br/>「推定」のまま記録できます。</p></section><button type="button" className="backup-shortcut" onClick={()=>setView("data")}><Icon name="download" size={18}/><span>記録をバックアップ<small>大切なデータを手元にも</small></span><Icon name="right" size={16}/></button></aside></div>}
    </>}
    </main><footer className="app-footer"><span>sleep log</span><p>あなたの眠りを、あなたのために。</p><span>JST / UTC+9</span></footer></div>
    {access==="ready"&&<nav className="mobile-nav" aria-label="モバイルナビゲーション">{NAV.map(item=><button key={item.view} type="button" className={view===item.view?"active":""} onClick={()=>setView(item.view)}><Icon name={item.icon} size={21}/><span>{item.label}</span></button>)}<button type="button" className="mobile-add" onClick={()=>openEditor()}><Icon name="plus" size={23}/><span>追加</span></button></nav>}
    {editor&&repository&&<RecordForm day={selected} userId={userId} entry={editor.entry} draft={editor.draft} repository={repository} onClose={()=>setEditor(null)} onSaved={message=>{setEditor(null);setPendingDraft(null);setNotice(message);reload();}}/>}
  </div>;
}
