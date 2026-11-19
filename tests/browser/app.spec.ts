import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createLockSettings } from "../../src/lib/note-lock";
async function enter(page:Page){await page.clock.install({time:new Date("2026-10-18T12:00:00Z")});await page.goto("./");await page.getByRole("button",{name:"画面を体験する",exact:true}).click();await expect(page.locator(".record-card")).toHaveCount(3);}
async function menu(page:Page,label:string){
  const button=page.getByRole("button",{name:label,exact:true});
  if(label==="データ管理"&&!(await button.isVisible()))await page.getByLabel("メニュー",{exact:true}).click();
  await button.click();
}
async function chooseDay(page:Page,day:string){await menu(page,"カレンダー");await page.getByRole("button",{name:new RegExp(`^${day} `)}).click();}
test("日別の複数記録と合計を表示し、横にはみ出さない",async({page},info)=>{
  const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  await enter(page);await expect(page.locator(".summary-total")).toHaveText(/13時間30分/);
  await expect(page.locator(".demo-banner strong")).toHaveText("体験モード");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);await page.screenshot({path:`/tmp/sleep-log-${info.project.name}.png`,fullPage:true});
});
test("日付をまたぐ記録を追加・編集・削除し、両日へ配分する",async({page})=>{
  await enter(page);await chooseDay(page,"2026-10-10");await page.locator(".add-record-dashed").click();
  const form=page.getByRole("dialog");await form.getByRole("button",{name:"寝落ち",exact:true}).click();
  await expect(form.getByRole("group",{name:"眠った意図"})).toHaveCount(0);
  await expect(form.getByLabel("時刻は推定")).toHaveCount(0);
  await form.getByLabel("就寝日",{exact:true}).fill("2026-10-10");await form.getByLabel("就寝時刻",{exact:true}).fill("23:00");
  await form.getByLabel("終了日",{exact:true}).fill("2026-10-11");await form.getByLabel("終了時刻",{exact:true}).fill("07:00");
  await expect(form.locator(".duration-preview")).toContainText("8時間");
  await form.getByRole("button",{name:"保存する",exact:true}).click();await expect(form).not.toBeVisible();
  await expect(page.locator(".summary-total")).toHaveText(/1時間0分/);
  await chooseDay(page,"2026-10-11");await expect(page.locator(".summary-total")).toHaveText(/7時間0分/);
  await expect(page.locator(".record-card")).toHaveCount(1);await page.locator(".record-main").click();
  await form.locator("summary").click();await form.getByLabel("日記",{exact:true}).fill("日付またぎをあとから記録");
  await form.getByRole("button",{name:"保存する",exact:true}).click();await expect(page.locator(".record-note")).toHaveText("日付またぎをあとから記録");
  await page.locator(".record-main").click();page.once("dialog",dialog=>dialog.accept());
  await form.getByRole("button",{name:"この記録を削除する",exact:true}).click();await expect(form).not.toBeVisible();
  await expect(page.locator(".summary-total")).toHaveText("—");await expect(page.getByText("この日の睡眠は、まだ記録されていません。")).toBeVisible();
});
test("重複と終了以前の日時を拒否し、入力は残す",async({page})=>{
  await enter(page);await page.locator(".add-record-dashed").click();const form=page.getByRole("dialog");
  await form.getByRole("button",{name:"通常睡眠",exact:true}).click();await form.getByLabel("就寝時刻",{exact:true}).fill("02:30");await form.getByLabel("終了時刻",{exact:true}).fill("03:00");
  await form.getByRole("button",{name:"保存する",exact:true}).click();await expect(form.getByRole("alert")).toContainText("重なっています");
  await expect(form.getByLabel("就寝時刻",{exact:true})).toHaveValue("02:30");
  await form.getByLabel("終了時刻",{exact:true}).fill("01:00");await form.getByRole("button",{name:"保存する",exact:true}).click();await expect(form.getByRole("alert")).toContainText("終了日時を開始日時より後");
});
test("全件書き出し、不足分の復元、二重復元を扱う",async({page})=>{
  await enter(page);await menu(page,"データ管理");
  const downloadPromise=page.waitForEvent("download");await page.getByRole("button",{name:"バックアップを書き出す",exact:true}).click();
  const download=await downloadPromise;const backup=JSON.parse(await readFile((await download.path())!,"utf8"));
  expect(backup.count).toBe(6);expect(backup.entries[0]).not.toHaveProperty("user_id");
  backup.entries.push({...backup.entries[0],id:"dddddddd-dddd-4ddd-8ddd-000000000001",start_at:"2026-10-09T17:00:00Z",end_at:"2026-10-09T23:00:00Z"});backup.count++;
  const payload={name:"backup.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(backup))};
  await page.getByLabel("復元するバックアップファイル").setInputFiles(payload);
  await expect(page.getByRole("heading",{name:"復元する内容を確認"})).toBeVisible();await page.getByRole("button",{name:"1件を復元する",exact:true}).click();
  await expect(page.getByText("1件を復元しました。既存の6件は変更していません。")).toBeVisible();
  await page.getByLabel("復元するバックアップファイル").setInputFiles(payload);await expect(page.getByRole("button",{name:"0件を復元する",exact:true})).toBeDisabled();
});
test("再読み込み後も同じタブから未保存の入力を再開する",async({page})=>{
  await enter(page);await page.locator(".add-record-dashed").click();const form=page.getByRole("dialog");
  await form.getByRole("button",{name:"その他",exact:true}).click();await form.getByLabel("就寝時刻",{exact:true}).fill("10:05");
  page.once("dialog",dialog=>dialog.accept());await page.reload();await page.getByRole("button",{name:"画面を体験する",exact:true}).click();
  await page.getByRole("button",{name:"入力を再開する",exact:true}).click();await expect(page.getByRole("dialog").getByLabel("就寝時刻",{exact:true})).toHaveValue("10:05");
});

test("週間と月間の分析・全件の時刻・種類の絞り込みを表示する",async({page},info)=>{
  const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  await enter(page);await menu(page,"分析");
  await expect(page.getByRole("heading",{name:"眠りの分析",exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  await expect(page.locator(".analysis-page")).not.toContainText("推定");
  await expect(page.locator('[aria-label="1日平均の睡眠時間"]')).toContainText("9時間13分");
  await expect(page.locator('[aria-label="期間の合計睡眠時間"]')).toContainText("27時間40分");
  await expect(page.locator(".timeline-segment")).toHaveCount(6);
  await expect(page.locator(".time-point")).toHaveCount(12);
  await page.getByLabel("時刻グラフの種類",{exact:true}).selectOption("doze");
  await expect(page.locator(".time-point")).toHaveCount(2);
  await page.getByLabel("時刻グラフの種類",{exact:true}).selectOption("all");
  await page.getByRole("button",{name:"月間",exact:true}).click();
  await expect(page.locator(".timeline-row")).toHaveCount(31);
  await expect(page.locator('[aria-label="記録日数"]')).toContainText("経過18日中・未記録15日");
  for(const chart of await page.locator(".chart-scroll").all()) {
    expect(await chart.evaluate(el=>{
      const viewport=el.getBoundingClientRect();const axis=el.querySelector(".chart-y-axis")!.getBoundingClientRect();
      return axis.left>=viewport.left-1&&axis.right<=viewport.right+1;
    })).toBe(true);
  }
  expect(await page.getByRole("button",{name:/^2026-10-17 13時間30分 日別/}).evaluate(el=>{
    const box=el.getBoundingClientRect();const viewport=el.closest(".chart-scroll")!.getBoundingClientRect();
    return box.left+box.width/2>=viewport.left&&box.left+box.width/2<=viewport.right;
  })).toBe(true);
  expect(await page.locator(".timeline-row.selected").evaluate(el=>{
    const box=el.getBoundingClientRect();const viewport=el.closest(".timeline-scroll")!.getBoundingClientRect();
    return box.top+box.height/2>=viewport.top&&box.top+box.height/2<=viewport.bottom;
  })).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:`/tmp/sleep-log-analysis-${info.project.name}.png`,fullPage:true});
  expect(errors).toEqual([]);
});

test("月をまたぐ週のタイムラインから編集し、週と各月の合計を更新する",async({page})=>{
  await page.clock.install({time:new Date("2026-10-18T12:00:00Z")});
  await page.addInitScript(()=>{
    sessionStorage.setItem("sleep-log-demo-v1",JSON.stringify([{
      id:"aaaaaaaa-aaaa-4aaa-8aaa-000000000001",user_id:"99999999-9999-4999-8999-000000000001",
      start_at:"2026-09-30T14:00:00.000Z",end_at:"2026-09-30T22:00:00.000Z",kind:"normal",
      record_timezone:"Asia/Tokyo",note:null,
      created_at:"2026-10-01T00:00:00Z",updated_at:"2026-10-01T00:00:00Z",revision:1,
    }]));
  });
  await page.goto("./");await page.getByRole("button",{name:"画面を体験する",exact:true}).click();
  await chooseDay(page,"2026-10-01");await menu(page,"分析");
  await expect(page.locator('[aria-label="期間の合計睡眠時間"]')).toContainText("8時間");
  await expect(page.locator(".timeline-segment")).toHaveCount(2);
  await page.locator(".timeline-segment").first().focus();
  await expect(page.locator(".timeline-segment.highlighted")).toHaveCount(2);
  await page.locator(".timeline-segment.continues-before").click();
  const form=page.getByRole("dialog");await expect(form.getByLabel("就寝日",{exact:true})).toHaveValue("2026-09-30");
  await form.getByLabel("終了時刻",{exact:true}).fill("08:00");await form.getByRole("button",{name:"保存する",exact:true}).click();
  await expect(form).not.toBeVisible();await expect(page.locator('[aria-label="期間の合計睡眠時間"]')).toContainText("9時間");
  await page.getByRole("button",{name:"月間",exact:true}).click();
  await expect(page.locator('[aria-label="期間の合計睡眠時間"]')).toContainText("8時間");
  await page.getByRole("button",{name:"前の分析期間",exact:true}).click();
  await expect(page.locator('[aria-label="期間の合計睡眠時間"]')).toContainText("1時間");
});

test("未記録期間の平均を空欄にし、棒グラフの日付から日別記録を開く",async({page})=>{
  await enter(page);await menu(page,"分析");
  await page.getByRole("button",{name:/^2026-10-17 13時間30分 日別/}).click();
  await expect(page.locator(".record-card")).toHaveCount(3);
  await chooseDay(page,"2026-10-01");await menu(page,"分析");
  await expect(page.locator('[aria-label="1日平均の睡眠時間"] strong')).toHaveText("—");
  await expect(page.locator(".timeline-segment")).toHaveCount(0);
  await expect(page.getByText("この期間に該当する就寝・起床の記録はありません。")).toBeVisible();
});

test("年間・全期間の両端を詰め、基準日入力を表示しない",async({page},info)=>{
  await enter(page);await menu(page,"分析");
  await expect(page.getByLabel("分析の基準日")).toHaveCount(0);
  await page.getByRole("button",{name:"年間",exact:true}).click();
  await expect(page.locator(".timeline-row")).toHaveCount(3);
  await expect(page.locator(".daily-chart-day")).toHaveCount(3);
  await expect(page.locator(".analysis-display-range")).toContainText("10月15日");
  await expect(page.locator(".analysis-display-range")).toContainText("10月17日");
  await expect(page.locator('[aria-label="期間の合計睡眠時間"]')).toContainText("27時間40分");
  await page.getByRole("button",{name:"全期間",exact:true}).click();
  await expect(page.locator(".timeline-row")).toHaveCount(3);
  await expect(page.getByRole("button",{name:"前の分析期間"})).toHaveCount(0);
  await expect(page.getByRole("button",{name:"次の分析期間"})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:`/tmp/sleep-log-all-${info.project.name}.png`,fullPage:true});
});

async function enterHistory(page:Page){
  await page.clock.install({time:new Date("2026-10-18T12:00:00Z")});
  await page.addInitScript(()=>{
    const entries=[
      {start_at:"2024-05-17T17:00:00.000Z",end_at:"2024-05-17T23:00:00.000Z",note:"昔の日記\n二行目の内容"},
      {start_at:"2025-12-31T14:00:00.000Z",end_at:"2025-12-31T17:00:00.000Z",note:"年越しの日記"},
      {start_at:"2026-02-09T18:00:00.000Z",end_at:"2026-02-09T23:00:00.000Z",note:"  "},
      {start_at:"2026-10-16T17:00:00.000Z",end_at:"2026-10-16T23:00:00.000Z",note:"最近の日記"},
    ].map((item,index)=>({...item,id:`aaaaaaaa-aaaa-4aaa-8aaa-${String(index+1).padStart(12,"0")}`,user_id:"99999999-9999-4999-8999-000000000001",kind:"normal",record_timezone:"Asia/Tokyo",created_at:"2026-01-01T00:00:00Z",updated_at:"2026-01-01T00:00:00Z",revision:1}));
    sessionStorage.setItem("sleep-log-demo-v1",JSON.stringify(entries));
  });
  await page.goto("./");await page.getByRole("button",{name:"画面を体験する",exact:true}).click();
}

test("日記に全期間の内容を新しい順で表示し、検索・編集・空欄への変更を反映する",async({page},info)=>{
  await enterHistory(page);await menu(page,"日記");
  await expect(page.locator(".note-card")).toHaveCount(3);
  await expect(page.locator(".note-body").first()).toHaveText("最近の日記");
  await expect(page.locator(".note-body").last()).toHaveText("昔の日記\n二行目の内容");
  await page.getByLabel("日記を検索").fill("昔");await expect(page.locator(".note-card")).toHaveCount(1);
  await page.getByRole("button",{name:"2024-05-18 通常睡眠の日記を全文表示"}).click();
  await page.getByRole("button",{name:"2024-05-18 通常睡眠の日記を編集"}).click();
  const form=page.getByRole("dialog");await expect(form.getByLabel("就寝日",{exact:true})).toHaveValue("2024-05-18");
  await form.getByLabel("日記",{exact:true}).fill("更新した昔の日記\n改行も保持");
  await form.getByRole("button",{name:"保存する",exact:true}).click();await expect(form).not.toBeVisible();
  await expect(page.locator(".note-body")).toHaveText("更新した昔の日記\n改行も保持");
  await page.getByLabel("日記を検索").fill("");await expect(page.locator(".note-card")).toHaveCount(3);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:`/tmp/sleep-log-notes-${info.project.name}.png`,fullPage:true});
  await page.getByRole("button",{name:"2024-05-18 通常睡眠の日記を全文表示"}).click();
  await page.getByRole("button",{name:"2024-05-18 通常睡眠の日記を編集"}).click();
  await form.getByLabel("日記",{exact:true}).fill("");await form.getByRole("button",{name:"保存する",exact:true}).click();
  await expect(form).not.toBeVisible();await expect(page.locator(".note-card")).toHaveCount(2);
});

test("年間と全期間に何年も前の記録と年をまたぐ睡眠を正しく含める",async({page})=>{
  await enterHistory(page);await menu(page,"分析");
  await page.getByRole("button",{name:"年間",exact:true}).click();
  await expect(page.locator('[aria-label="期間の合計睡眠時間"]')).toContainText("13時間");
  await expect(page.locator(".analysis-display-range")).toContainText("1月1日");
  await expect(page.locator(".analysis-display-range")).toContainText("10月17日");
  await page.getByRole("button",{name:"前の分析期間"}).click();
  await expect(page.locator('[aria-label="期間の合計睡眠時間"]')).toContainText("1時間");
  await expect(page.locator(".timeline-row")).toHaveCount(1);
  await page.getByRole("button",{name:"全期間",exact:true}).click();
  await expect(page.locator('[aria-label="期間の合計睡眠時間"]')).toContainText("20時間");
  await expect(page.locator(".analysis-display-range")).toContainText("2024年5月18日");
  await expect(page.locator(".time-point")).toHaveCount(8);
});

test("スマホのデータ管理を上部メニューから開き、キャッチコピーを表示しない",async({page},info)=>{
  await enter(page);
  if(info.project.name==="mobile"){
    await expect(page.getByRole("navigation",{name:"モバイルナビゲーション"}).getByRole("button",{name:"データ管理",exact:true})).toHaveCount(0);
    await expect(page.getByRole("navigation",{name:"モバイルナビゲーション"}).getByRole("button",{name:"日記",exact:true})).toBeVisible();
    await page.getByLabel("メニュー",{exact:true}).click();await expect(page.locator(".mobile-menu")).toHaveAttribute("open","");
    await page.keyboard.press("Escape");await expect(page.locator(".mobile-menu")).not.toHaveAttribute("open","");
    await page.getByLabel("メニュー",{exact:true}).click();
    await page.screenshot({path:"/tmp/sleep-log-mobile-menu.png",fullPage:false});
    await page.getByRole("button",{name:"データ管理",exact:true}).click();
    await expect(page.locator(".mobile-menu")).not.toHaveAttribute("open","");
  }else await menu(page,"データ管理");
  await expect(page.getByRole("heading",{name:"データ管理",exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"バックアップを書き出す",exact:true})).toBeVisible();
  for(const text of ["眠りのひとつひとつを、ありのままに。","睡眠のリズムを、少しずつ知る。","あなたの眠りを、あなたのために。","大切な記録を、手元にも。"]){
    await expect(page.getByText(text,{exact:true})).toHaveCount(0);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test("分析の週間・月間・年間・全期間を画面移動と再読み込み後も保持する",async({page})=>{
  await enter(page);await menu(page,"分析");
  for(const label of ["月間","年間","全期間","週間"]){
    await page.getByRole("button",{name:label,exact:true}).click();
    await menu(page,"日記");await menu(page,"分析");
    await expect(page.getByRole("button",{name:label,exact:true})).toHaveAttribute("aria-pressed","true");
    await page.reload();await page.getByRole("button",{name:"画面を体験する",exact:true}).click();await menu(page,"分析");
    await expect(page.getByRole("button",{name:label,exact:true})).toHaveAttribute("aria-pressed","true");
  }
});

test("日記の改行を4行プレビューで詰め、1件だけ全文を展開して編集できる",async({page},info)=>{
  const longNote="一行目の振り返り。\n\n二行目には、その日の出来事を書いています。\n"+"長い日記の文章です。".repeat(35)+"\n最後の行も編集画面で読めます。";
  await page.clock.install({time:new Date("2026-10-18T12:00:00Z")});
  await page.addInitScript(({longNote})=>{
    const entries=[
      {start_at:"2025-12-31T17:00:00.000Z",end_at:"2025-12-31T23:00:00.000Z",note:longNote,kind:"normal"},
      {start_at:"2026-01-01T04:00:00.000Z",end_at:"2026-01-01T05:00:00.000Z",note:"授業の課題が終わった。明日の準備も済ませた。",kind:"nap"},
      {start_at:"2025-12-30T17:00:00.000Z",end_at:"2025-12-30T23:00:00.000Z",note:"年末の記録。\nこの改行も残す。",kind:"normal"},
    ].map((entry,index)=>({...entry,id:`aaaaaaaa-aaaa-4aaa-8aaa-${String(index+1).padStart(12,"0")}`,user_id:"99999999-9999-4999-8999-000000000001",record_timezone:"Asia/Tokyo",created_at:"2026-01-01T00:00:00Z",updated_at:"2026-01-01T00:00:00Z",revision:1}));
    sessionStorage.setItem("sleep-log-demo-v1",JSON.stringify(entries));
  },{longNote});
  await page.goto("./");await page.getByRole("button",{name:"画面を体験する",exact:true}).click();await menu(page,"日記");
  const toggle=page.getByRole("switch",{name:"日記の日付を1日前に表示"});
  await expect(toggle).toBeChecked();await expect(page.locator(".note-day")).toHaveCount(2);
  await expect(page.locator(".note-day-heading time").first()).toHaveAttribute("datetime","2025-12-31");
  await expect(page.locator(".note-day").first().locator(".note-card")).toHaveCount(2);
  await expect(page.locator(".note-card .note-sleep, .note-card time")).toHaveCount(0);
  await expect(page.getByText("就寝日の前日で表示しています。",{exact:false})).toHaveCount(0);
  await expect(page.locator(".notes-preview-help")).toHaveCount(0);
  await expect(page.locator(".note-sleep-time").first()).toHaveText("13:00〜14:00");
  await expect(page.locator(".note-sleep-duration").first()).toHaveText("1時間");
  expect(await page.locator(".note-entry-header").first().evaluate(el=>{
    const day=el.querySelector(".note-date-day")!,month=el.querySelector(".note-date-month")!;
    const date=el.querySelector("time")!.getBoundingClientRect(),dot=el.querySelector(".dot")!.getBoundingClientRect();
    return parseFloat(getComputedStyle(day).fontSize)>parseFloat(getComputedStyle(month).fontSize)*2 && dot.left>=date.right && dot.left-date.right<24;
  })).toBe(true);
  const card=page.getByRole("button",{name:"2026-01-01 通常睡眠の日記を全文表示",exact:true});
  const body=page.locator("#note-body-aaaaaaaa-aaaa-4aaa-8aaa-000000000001");
  const edit=page.getByRole("button",{name:"2026-01-01 通常睡眠の日記を編集",exact:true});
  await expect(edit).toHaveCount(0);
  expect(await body.evaluate(el=>{
    const style=getComputedStyle(el);return style.whiteSpace==="normal" && style.webkitLineClamp==="4" && el.clientHeight<el.scrollHeight && el.clientHeight<=parseFloat(style.lineHeight)*4+1;
  })).toBe(true);
  await page.screenshot({path:`/tmp/sleep-log-compact-notes-${info.project.name}.png`,fullPage:true});
  await card.click();await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".note-card.expanded")).toHaveCount(1);
  await expect(body).toHaveCSS("white-space","pre-wrap");
  expect(await body.evaluate(el=>el.clientHeight>=el.scrollHeight)).toBe(true);
  await expect(body).toHaveText(longNote);
  await expect(edit).toBeVisible();
  await expect(page.locator(".note-card .note-actions")).toHaveCount(0);
  await page.screenshot({path:`/tmp/sleep-log-expanded-note-${info.project.name}.png`,fullPage:true});
  await page.getByRole("button",{name:"2026-01-01 昼寝の日記を全文表示",exact:true}).click();
  await expect(page.locator(".note-card.expanded")).toHaveCount(1);await expect(edit).toHaveCount(0);
  await expect(body).toHaveCSS("white-space","normal");
  await card.click();await edit.click();const form=page.getByRole("dialog");
  await expect(form.getByLabel("就寝日",{exact:true})).toHaveValue("2026-01-01");
  await expect(form.getByLabel("日記",{exact:true})).toHaveValue(longNote);
  await form.getByRole("button",{name:"閉じる",exact:true}).click();
  await expect(edit).toBeFocused();
  await expect(page.getByRole("link",{name:"本文へ移動",exact:true})).not.toBeInViewport();
  await page.getByRole("button",{name:"2026-01-01 通常睡眠の日記を閉じる",exact:true}).click();
  await expect(page.locator(".note-card.expanded")).toHaveCount(0);
  await toggle.uncheck();await expect(page.locator(".note-day-heading time").first()).toHaveAttribute("datetime","2026-01-01");
  await page.getByLabel("日記を検索").fill("2026-01-01");await expect(page.locator(".note-card")).toHaveCount(2);
  await page.getByLabel("日記を検索").fill("");
  await menu(page,"分析");await page.getByRole("button",{name:"全期間",exact:true}).click();
  await expect(page.locator('[aria-label="期間の合計睡眠時間"]')).toContainText("13時間");
  await menu(page,"日記");await expect(toggle).not.toBeChecked();
  await page.reload();await page.getByRole("button",{name:"画面を体験する",exact:true}).click();await menu(page,"日記");
  await expect(toggle).not.toBeChecked();await expect(page.locator(".note-day-heading time").first()).toHaveAttribute("datetime","2026-01-01");
  await toggle.check();await page.getByLabel("日記を検索").fill("2025-12-31");await expect(page.locator(".note-card")).toHaveCount(2);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test("日別の日記だけを展開し、末尾の空行を除いて保存する。日時入力は狭い幅にも収まる",async({page},info)=>{
  await enter(page);
  await expect(page.getByText("合計は日本時間の0:00で区切って計算しています。",{exact:true})).toHaveCount(0);
  await expect(page.locator(".app-footer")).toHaveCSS("border-top-width","0px");
  const first=page.locator(".record-note-toggle").first();
  await first.locator(".record-note").click();await expect(first).toHaveAttribute("aria-expanded","true");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.locator(".record-note-toggle").nth(1).click();
  await expect(first).toHaveAttribute("aria-expanded","false");
  await expect(page.locator('.record-note-toggle[aria-expanded="true"]')).toHaveCount(1);
  await page.locator(".record-main").first().click();
  const form=page.getByRole("dialog");
  const sizes=info.project.name==="mobile"?[320,390]:[1440];
  for(const width of sizes){
    await page.setViewportSize({width,height:900});
    expect(await form.locator(".datetime-row input").evaluateAll(inputs=>inputs.every(input=>{
      const field=input.getBoundingClientRect(),block=input.closest(".time-block")!.getBoundingClientRect();
      return field.left>=block.left&&field.right<=block.right&&input.scrollWidth<=input.clientWidth+1;
    }))).toBe(true);
    expect(await form.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  }
  await page.screenshot({path:`/tmp/sleep-log-time-input-${info.project.name}.png`,fullPage:false});
  const note=form.getByLabel("日記",{exact:true});
  await note.fill("  先頭はそのまま\n\n途中の改行も残す\n  \n");
  await form.getByRole("button",{name:"保存する",exact:true}).click();await expect(form).not.toBeVisible();
  await page.locator(".record-note-toggle").first().click();
  expect(await page.locator(".record-note").first().textContent()).toBe("  先頭はそのまま\n\n途中の改行も残す");
  await menu(page,"日記");
  await page.getByRole("button",{name:"2026-10-17 通常睡眠の日記を全文表示"}).click();
  expect(await page.locator(".note-card.expanded .note-body").textContent()).toBe("  先頭はそのまま\n\n途中の改行も残す");
});

test("カレンダーの円を12時間で1周、超過を2周目として表示し、時間と一緒にセル内へ収める",async({page},info)=>{
  await page.clock.install({time:new Date("2026-10-18T12:00:00Z")});
  await page.addInitScript(()=>{
    const entries=[
      ["2026-10-10T00:00:00+09:00","2026-10-10T12:00:00+09:00"],
      ["2026-10-11T00:00:00+09:00","2026-10-12T00:00:00+09:00"],
      ["2026-10-13T02:00:00+09:00","2026-10-13T08:00:00+09:00"],
      ["2026-10-17T00:00:00+09:00","2026-10-17T13:30:00+09:00"],
    ].map(([start_at,end_at],index)=>({start_at,end_at,id:`aaaaaaaa-aaaa-4aaa-8aaa-${String(index+1).padStart(12,"0")}`,user_id:"99999999-9999-4999-8999-000000000001",kind:"normal",record_timezone:"Asia/Tokyo",note:null,created_at:"2026-01-01T00:00:00Z",updated_at:"2026-01-01T00:00:00Z",revision:1}));
    sessionStorage.setItem("sleep-log-demo-v1",JSON.stringify(entries));
  });
  await page.goto("./");await page.getByRole("button",{name:"画面を体験する",exact:true}).click();await menu(page,"カレンダー");
  const day=(date:string)=>page.getByRole("button",{name:new RegExp(`^${date} `)});
  await expect(day("2026-10-10").locator(".sleep-ring-first")).toHaveAttribute("stroke-dasharray","720 720");
  await expect(day("2026-10-10").locator(".sleep-ring-second")).toHaveCount(0);
  await expect(day("2026-10-11").locator(".sleep-ring-second")).toHaveAttribute("stroke-dasharray","720 720");
  await expect(day("2026-10-13").locator(".sleep-ring-first")).toHaveAttribute("stroke-dasharray","360 720");
  await expect(day("2026-10-17").locator(".sleep-ring-second")).toHaveAttribute("stroke-dasharray","90 720");
  await expect(day("2026-10-14").locator(".sleep-ring-first")).toHaveCount(0);
  for(const width of info.project.name==="mobile"?[320,390]:[1440]){
    await page.setViewportSize({width,height:900});
    expect(await page.locator(".calendar-sleep").evaluateAll(rows=>rows.every(row=>{
      const cell=row.closest(".calendar-day")!.getBoundingClientRect();
      return [...row.children].every(child=>{const box=child.getBoundingClientRect();return box.left>=cell.left&&box.right<=cell.right;});
    }))).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    expect(await day("2026-10-13").locator(".calendar-sleep-ring").evaluate(el=>el.getBoundingClientRect().width)).toBeGreaterThanOrEqual(27);
    expect(await day("2026-10-13").locator(".calendar-time").evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
  }
  expect(await day("2026-10-13").locator(".sleep-ring-first").evaluate(el=>getComputedStyle(el).stroke)).toBe("rgb(187, 76, 136)");
  await page.screenshot({path:`/tmp/sleep-log-calendar-rings-${info.project.name}.png`,fullPage:true});
});

test("日別の日記本文を押すと長い文章も改行付きで全文になり、別の本文を押すと元に戻る",async({page},info)=>{
  await enter(page);await page.locator(".record-main").first().click();
  const text="最初の行。\n\n"+"長い日記の内容を最後まで読む。".repeat(35)+"\n最後の行。";
  const form=page.getByRole("dialog");await form.getByLabel("日記",{exact:true}).fill(text);
  await form.getByRole("button",{name:"保存する",exact:true}).click();await expect(form).not.toBeVisible();
  const first=page.locator(".record-note-toggle").first(),body=first.locator(".record-note");
  const collapsed=await body.evaluate(el=>el.getBoundingClientRect().height);
  await body.click();await expect(first).toHaveAttribute("aria-expanded","true");
  await expect(body).toHaveCSS("white-space","pre-wrap");
  expect(await body.evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThan(collapsed*2);
  expect(await body.textContent()).toBe(text);await expect(form).not.toBeVisible();
  await expect(first.getByText("閉じる",{exact:true})).toBeVisible();
  await page.screenshot({path:`/tmp/sleep-log-daily-note-full-${info.project.name}.png`,fullPage:true});
  await page.locator(".record-note-toggle").nth(1).locator(".record-note").click();
  await expect(first).toHaveAttribute("aria-expanded","false");
  expect(await body.evaluate(el=>el.getBoundingClientRect().height)).toBe(collapsed);
});

test("平均を大きく表示し、就寝・起床の回数と種類フィルター・スワイプ・選択の保持を扱う",async({page},info)=>{
  await enter(page);await menu(page,"分析");
  const primary=page.locator(".primary-metric > strong"),secondary=page.locator('.analysis-metric:not(.primary-metric) > strong').first();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(await primary.evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThan((await secondary.evaluate(el=>parseFloat(getComputedStyle(el).fontSize)))*2);
  expect(await page.locator(".timeline-row").first().evaluate(el=>el.getBoundingClientRect().height)).toBeLessThanOrEqual(32);
  await page.getByRole("button",{name:"月間",exact:true}).click();
  const start=page.getByRole("region",{name:"就寝の時間帯",exact:true}),end=page.getByRole("region",{name:"起床の時間帯",exact:true});
  await expect(start.locator("h3")).toContainText("6回");await expect(end.locator("h3")).toContainText("6回");
  await expect(start.locator(".event-kind-counts")).toContainText("通常睡眠3回50.0%");
  await expect(start.locator(".event-kind-counts")).toContainText("昼寝2回33.3%");
  const panel=page.locator(".event-time-panel"),filter=page.getByLabel("時間帯の種類",{exact:true});
  const swipe=async(dx:number,dy:number)=>{
    await panel.dispatchEvent("touchstart",{touches:[{identifier:1,clientX:200,clientY:200}]});
    await panel.dispatchEvent("touchend",{touches:[],changedTouches:[{identifier:1,clientX:200+dx,clientY:200+dy}]});
  };
  await swipe(-100,0);await expect(filter).toHaveValue("without-nap");
  await expect(start.locator("h3")).toContainText("4回");await expect(end.locator("h3")).toContainText("4回");
  await swipe(100,0);await expect(filter).toHaveValue("all");
  await swipe(10,100);await expect(filter).toHaveValue("all");
  await filter.selectOption("doze");await expect(start.locator("h3")).toContainText("1回");
  const trendFilter=page.getByLabel("時刻グラフの種類",{exact:true});
  await trendFilter.selectOption("without-nap");await expect(page.locator(".time-point")).toHaveCount(8);
  await expect(page.locator(".time-chart")).toHaveCount(1);
  // 各日の就寝と起床は同じ縦線上に重ねない。
  const pair=await page.locator(".time-point").evaluateAll(els=>els.filter(el=>el.getAttribute("aria-label")?.startsWith("2026-10-17 ")).map(el=>({event:el.classList.contains("start")?"start":"end",left:(el as HTMLElement).style.left})));
  expect(pair.find(p=>p.event==="start")?.left).not.toBe(pair.find(p=>p.event==="end")?.left);
  await menu(page,"日別の記録");await menu(page,"分析");
  await expect(filter).toHaveValue("doze");await expect(trendFilter).toHaveValue("without-nap");
  await page.reload();await page.getByRole("button",{name:"画面を体験する",exact:true}).click();await menu(page,"分析");
  await expect(filter).toHaveValue("doze");await expect(trendFilter).toHaveValue("without-nap");
  await expect(page.getByRole("button",{name:"月間",exact:true})).toHaveAttribute("aria-pressed","true");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await filter.selectOption("all");await trendFilter.selectOption("all");
  await panel.screenshot({path:`/tmp/sleep-log-event-times-${info.project.name}.png`});
  await page.locator(".time-trends-panel").screenshot({path:`/tmp/sleep-log-time-trends-${info.project.name}.png`});
  await page.screenshot({path:`/tmp/sleep-log-refined-analysis-${info.project.name}.png`,fullPage:true});
});

test("日記ごとの表示ロックを設定し、共通パスワードでまとめて解除・再ロックする。バックアップは本文を保つ",async({page},info)=>{
  test.setTimeout(60_000);
  await enter(page);await menu(page,"日記");
  const password="diary-test-password";
  const normal="2026-10-17 通常睡眠の日記",nap="2026-10-17 昼寝の日記";
  const dialog=()=>page.locator(".diary-lock-dialog");
  const unlock=async()=>{await dialog().getByLabel("日記のパスワード",{exact:true}).fill(password);await dialog().getByRole("button",{name:"解除する",exact:true}).click();await expect(dialog()).toHaveCount(0);};
  await page.getByRole("button",{name:`${normal}を全文表示`,exact:true}).click();
  await page.getByRole("button",{name:`${normal}のロックを設定`,exact:true}).click();
  await expect(dialog().getByRole("heading")).toHaveText("日記のパスワードを設定");
  await dialog().getByLabel("日記のパスワード",{exact:true}).fill(password);
  await dialog().getByLabel("確認用パスワード",{exact:true}).fill("different-password");
  await dialog().getByRole("button",{name:"設定してロックする",exact:true}).click();
  await expect(dialog().getByRole("alert")).toContainText("一致しません");
  await dialog().getByLabel("確認用パスワード",{exact:true}).fill(password);
  await dialog().getByRole("button",{name:"設定してロックする",exact:true}).click();
  await expect(dialog()).toHaveCount(0);await expect(page.locator(".diary-locked")).toHaveCount(1);
  await page.clock.runFor(1);
  await expect(page.getByRole("button",{name:`${normal}のロックを解除`,exact:true})).toBeFocused();
  await expect(page.locator(".notes-page")).not.toContainText("夜の睡眠。目覚ましで起床。");
  await page.getByLabel("日記を検索").fill("目覚まし");await expect(page.locator(".note-card")).toHaveCount(0);
  await page.getByLabel("日記を検索").fill("");
  await page.getByRole("button",{name:`${nap}を全文表示`,exact:true}).click();
  await page.getByRole("button",{name:`${nap}のロックを設定`,exact:true}).click();
  await dialog().getByLabel("日記のパスワード",{exact:true}).fill(password);
  await dialog().getByRole("button",{name:"ロックする",exact:true}).click();
  await expect(dialog()).toHaveCount(0);await expect(page.locator(".diary-locked")).toHaveCount(2);
  await page.screenshot({path:`/tmp/sleep-log-locked-diary-${info.project.name}.png`,fullPage:true});
  await page.getByRole("button",{name:`${normal}のロックを解除`,exact:true}).click();
  await dialog().getByLabel("日記のパスワード",{exact:true}).fill("wrong-password");
  await dialog().getByRole("button",{name:"解除する",exact:true}).click();
  await expect(dialog().getByRole("alert")).toContainText("違います");await expect(page.locator(".diary-locked")).toHaveCount(2);
  await unlock();await expect(page.locator(".diary-locked")).toHaveCount(0);
  await expect(page.locator(".notes-page")).toContainText("夜の睡眠。目覚ましで起床。");
  await expect(page.locator(".notes-page")).toContainText("授業のあとに少し昼寝。");
  await menu(page,"日別の記録");await page.locator(".record-main").first().click();
  const form=page.locator(".record-dialog");await expect(form.getByLabel("日記",{exact:true})).toHaveValue("夜の睡眠。目覚ましで起床。");
  await page.evaluate(()=>{Object.defineProperty(document,"hidden",{configurable:true,get:()=>true});document.dispatchEvent(new Event("visibilitychange"));Object.defineProperty(document,"hidden",{configurable:true,get:()=>false});});
  await expect(form.locator(".diary-form-locked")).toBeVisible();await expect(form.getByLabel("日記",{exact:true})).toHaveCount(0);
  await expect(form.getByRole("button",{name:"保存する",exact:true})).toBeDisabled();
  await form.getByRole("button",{name:"日記のロックを解除",exact:true}).click();await unlock();
  await form.getByLabel("日記",{exact:true}).fill("更新した日記の本文");
  await form.getByRole("button",{name:"保存する",exact:true}).click();await expect(form).not.toBeVisible();
  await menu(page,"データ管理");const downloading=page.waitForEvent("download");
  await page.getByRole("button",{name:"バックアップを書き出す",exact:true}).click();
  const backup=JSON.parse(await readFile((await(await downloading).path())!,"utf8"));
  expect(backup.entries.find((entry:{id:string})=>entry.id.endsWith("000000000001"))).toMatchObject({note:"更新した日記の本文",note_locked:true});
  expect(JSON.stringify(backup)).not.toContain(password);expect(JSON.stringify(backup)).not.toContain('"verifier"');
  await page.reload();await page.getByRole("button",{name:"画面を体験する",exact:true}).click();await menu(page,"日記");
  await expect(page.locator(".diary-locked")).toHaveCount(2);await expect(page.locator(".notes-page")).not.toContainText("更新した日記の本文");
  await page.getByRole("button",{name:`${normal}のロックを解除`,exact:true}).click();await unlock();
  await page.getByRole("button",{name:`${normal}のロックを外す`,exact:true}).click();
  await page.getByRole("button",{name:"日記を再ロック",exact:true}).click();
  await expect(page.locator(".diary-locked")).toHaveCount(1);await expect(page.locator(".notes-page")).toContainText("更新した日記の本文");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});


test("ロック前の古い下書きも保存先を確認して本文を隠し、解除後にだけ再開する",async({page})=>{
  const settings=await createLockSettings("diary-test-password");
  await page.clock.install({time:new Date("2026-10-18T12:00:00Z")});
  await page.addInitScript(({settings})=>{
    const user="99999999-9999-4999-8999-000000000001",id="aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
    const entry={id,user_id:user,start_at:"2026-10-17T02:00:00+09:00",end_at:"2026-10-17T08:00:00+09:00",kind:"normal",record_timezone:"Asia/Tokyo",note:"ロック済みの保存本文",note_locked:true,created_at:"2026-10-17T08:00:00+09:00",updated_at:"2026-10-17T08:00:00+09:00",revision:2};
    sessionStorage.setItem("sleep-log-demo-v1",JSON.stringify([entry]));
    sessionStorage.setItem("sleep-log-demo-v1-lock-settings",JSON.stringify(settings));
    sessionStorage.setItem(`sleep-log-draft:${user}`,JSON.stringify({userId:user,expiresAt:Date.now()+86400000,values:{id,revision:1,kind:"normal",startDate:"2026-10-17",startTime:"02:00",endDate:"2026-10-17",endTime:"08:00",note:"ロック前に書きかけだった本文",note_locked:false}}));
  },{settings});
  await page.goto("./");await page.getByRole("button",{name:"画面を体験する",exact:true}).click();
  await page.getByRole("button",{name:"入力を再開する",exact:true}).click();
  const form=page.locator(".record-dialog");
  await expect(form.getByLabel("日記",{exact:true})).toHaveCount(0);
  await expect(form).not.toContainText("ロック前に書きかけだった本文");
  await form.getByRole("button",{name:"日記のロックを解除",exact:true}).click();
  const unlock=page.locator(".diary-lock-dialog");await unlock.getByLabel("日記のパスワード",{exact:true}).fill("diary-test-password");
  await unlock.getByRole("button",{name:"解除する",exact:true}).click();
  await expect(form.getByLabel("日記",{exact:true})).toHaveValue("ロック前に書きかけだった本文");
  await form.getByRole("button",{name:"保存する",exact:true}).click();await expect(form.getByRole("alert")).toContainText("別の画面で変更");
});

test("データ管理から日記のパスワードを設定・変更し、古いパスワードを無効にして再ロックする",async({page},info)=>{
  test.setTimeout(60_000);
  await page.clock.install({time:new Date("2026-10-18T12:00:00Z")});
  await page.addInitScript(()=>{
    if(sessionStorage.getItem("diary-password-fixture"))return;
    sessionStorage.setItem("diary-password-fixture","ready");
    sessionStorage.setItem("sleep-log-demo-v1",JSON.stringify([{id:"aaaaaaaa-aaaa-4aaa-8aaa-000000000001",user_id:"99999999-9999-4999-8999-000000000001",start_at:"2026-10-17T02:00:00+09:00",end_at:"2026-10-17T08:00:00+09:00",kind:"normal",record_timezone:"Asia/Tokyo",note:"パスワード変更でも保持する本文",note_locked:true,created_at:"2026-10-17T08:00:00+09:00",updated_at:"2026-10-17T08:00:00+09:00",revision:1}]));
  });
  const oldPassword="previous-password",nextPassword="replacement-password";
  const dialog=page.locator(".diary-lock-dialog");
  const unlock=async(password:string)=>{await page.getByRole("button",{name:"2026-10-17 通常睡眠の日記のロックを解除",exact:true}).click();await dialog.getByLabel("日記のパスワード",{exact:true}).fill(password);await dialog.getByRole("button",{name:"解除する",exact:true}).click();};
  await page.goto("./");await page.getByRole("button",{name:"画面を体験する",exact:true}).click();await menu(page,"データ管理");
  await page.getByRole("button",{name:"パスワードを変更",exact:true}).click();
  await expect(dialog.getByRole("heading")).toHaveText("日記のパスワードを設定");
  await dialog.getByLabel("日記のパスワード",{exact:true}).fill(oldPassword);await dialog.getByLabel("確認用パスワード",{exact:true}).fill(oldPassword);
  await dialog.getByRole("button",{name:"設定する",exact:true}).click();await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("パスワードを設定しました");
  await menu(page,"日記");await unlock(oldPassword);await expect(dialog).toHaveCount(0);
  await expect(page.locator(".note-body")).toContainText("パスワード変更でも保持する本文");
  const recordsBefore=await page.evaluate(()=>sessionStorage.getItem("sleep-log-demo-v1"));
  await menu(page,"データ管理");await page.getByRole("button",{name:"パスワードを変更",exact:true}).click();
  await expect(dialog.getByRole("heading")).toHaveText("日記のパスワードを変更");
  const current=dialog.getByLabel("現在のパスワード",{exact:true}),next=dialog.getByLabel("新しいパスワード",{exact:true}),confirmation=dialog.getByLabel("新しいパスワード（確認）",{exact:true});
  await current.fill("wrong-password");await next.fill(nextPassword);await confirmation.fill(nextPassword);
  await dialog.getByRole("button",{name:"変更する",exact:true}).click();await expect(dialog.getByRole("alert")).toContainText("現在のパスワードが違います");
  await current.fill(oldPassword);await next.fill("short");await confirmation.fill("short");
  await dialog.getByRole("button",{name:"変更する",exact:true}).click();await expect(dialog.getByRole("alert")).toContainText("8文字以上");
  await next.fill(nextPassword);await confirmation.fill("different-password");
  await dialog.getByRole("button",{name:"変更する",exact:true}).click();await expect(dialog.getByRole("alert")).toContainText("一致しません");
  if(info.project.name==="mobile")await page.setViewportSize({width:320,height:900});
  expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  expect(await dialog.locator("input").evaluateAll(inputs=>inputs.every(input=>input.getBoundingClientRect().right<=input.closest("dialog")!.getBoundingClientRect().right))).toBe(true);
  await dialog.screenshot({path:`/tmp/sleep-log-change-password-${info.project.name}.png`});
  await dialog.getByRole("button",{name:"閉じる",exact:true}).click();await expect(page.getByRole("button",{name:"パスワードを変更",exact:true})).toBeFocused();
  await menu(page,"日記");await expect(page.locator(".note-body")).toContainText("パスワード変更でも保持する本文");
  await menu(page,"データ管理");await page.getByRole("button",{name:"パスワードを変更",exact:true}).click();
  await current.fill(oldPassword);await next.fill(nextPassword);await confirmation.fill(nextPassword);
  await dialog.getByRole("button",{name:"変更する",exact:true}).click();await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("パスワードを変更しました");
  expect(await page.evaluate(()=>sessionStorage.getItem("sleep-log-demo-v1"))).toBe(recordsBefore);
  const savedSettings=await page.evaluate(()=>sessionStorage.getItem("sleep-log-demo-v1-lock-settings"));
  expect(savedSettings).not.toContain(oldPassword);expect(savedSettings).not.toContain(nextPassword);
  await menu(page,"日記");await expect(page.locator(".diary-locked")).toHaveCount(1);await expect(page.locator(".note-body")).toHaveCount(0);
  await unlock(oldPassword);await expect(dialog.getByRole("alert")).toContainText("パスワードが違います");
  await dialog.getByLabel("日記のパスワード",{exact:true}).fill(nextPassword);await dialog.getByRole("button",{name:"解除する",exact:true}).click();await expect(dialog).toHaveCount(0);
  await page.reload();await page.getByRole("button",{name:"画面を体験する",exact:true}).click();await menu(page,"日記");
  await unlock(nextPassword);await expect(dialog).toHaveCount(0);await expect(page.locator(".note-body")).toContainText("パスワード変更でも保持する本文");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});
