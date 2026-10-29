import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
async function enter(page:Page){await page.clock.install({time:new Date("2026-10-18T12:00:00Z")});await page.goto("./");await page.getByRole("button",{name:"画面を体験する",exact:true}).click();await expect(page.locator(".record-card")).toHaveCount(3);}
async function menu(page:Page,label:string){await page.getByRole("button",{name:label,exact:true}).click();}
async function chooseDay(page:Page,day:string){await menu(page,"カレンダー");await page.getByRole("button",{name:new RegExp(`^${day} `)}).click();}
test("日別の複数記録と推定合計を表示し、横にはみ出さない",async({page},info)=>{
  const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  await enter(page);await expect(page.locator(".summary-total")).toHaveText(/約13時間30分/);
  await expect(page.locator(".demo-banner strong")).toHaveText("体験モード");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);await page.screenshot({path:`/tmp/sleep-log-${info.project.name}.png`,fullPage:true});
});
test("日付をまたぐ記録を追加・編集・削除し、両日へ配分する",async({page})=>{
  await enter(page);await chooseDay(page,"2026-10-10");await page.locator(".add-record-dashed").click();
  const form=page.getByRole("dialog");await form.getByRole("button",{name:"寝落ち",exact:true}).click();
  await expect(form.getByRole("button",{name:"意図せず",exact:true})).toHaveAttribute("aria-pressed","true");
  await form.getByLabel("開始日",{exact:true}).fill("2026-10-10");await form.getByLabel("開始時刻",{exact:true}).fill("23:00");
  await form.getByLabel("終了日",{exact:true}).fill("2026-10-11");await form.getByLabel("終了時刻",{exact:true}).fill("07:00");
  await expect(form.locator(".duration-preview")).toContainText("8時間");
  await form.getByRole("button",{name:"保存する",exact:true}).click();await expect(form).not.toBeVisible();
  await expect(page.locator(".summary-total")).toHaveText(/約1時間0分/);
  await chooseDay(page,"2026-10-11");await expect(page.locator(".summary-total")).toHaveText(/約7時間0分/);
  await expect(page.locator(".record-card")).toHaveCount(1);await page.locator(".record-card").click();
  await form.locator("summary").click();await form.getByLabel("メモ",{exact:true}).fill("日付またぎをあとから記録");
  await form.getByRole("button",{name:"保存する",exact:true}).click();await expect(page.locator(".record-note")).toHaveText("日付またぎをあとから記録");
  await page.locator(".record-card").click();page.once("dialog",dialog=>dialog.accept());
  await form.getByRole("button",{name:"この記録を削除する",exact:true}).click();await expect(form).not.toBeVisible();
  await expect(page.locator(".summary-total")).toHaveText("—");await expect(page.getByText("この日の睡眠は、まだ記録されていません。")).toBeVisible();
});
test("重複と終了以前の日時を拒否し、入力は残す",async({page})=>{
  await enter(page);await page.locator(".add-record-dashed").click();const form=page.getByRole("dialog");
  await form.getByRole("button",{name:"通常睡眠",exact:true}).click();await form.getByLabel("開始時刻",{exact:true}).fill("02:30");await form.getByLabel("終了時刻",{exact:true}).fill("03:00");
  await form.getByRole("button",{name:"保存する",exact:true}).click();await expect(form.getByRole("alert")).toContainText("重なっています");
  await expect(form.getByLabel("開始時刻",{exact:true})).toHaveValue("02:30");
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
  await form.getByRole("button",{name:"その他",exact:true}).click();await form.getByLabel("開始時刻",{exact:true}).fill("10:05");
  page.once("dialog",dialog=>dialog.accept());await page.reload();await page.getByRole("button",{name:"画面を体験する",exact:true}).click();
  await page.getByRole("button",{name:"入力を再開する",exact:true}).click();await expect(page.getByRole("dialog").getByLabel("開始時刻",{exact:true})).toHaveValue("10:05");
});

test("週間と月間の分析・全件の時刻・種類の絞り込みを表示する",async({page},info)=>{
  const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  await enter(page);await menu(page,"分析");
  await expect(page.getByRole("heading",{name:"眠りの分析",exact:true})).toBeVisible();
  await expect(page.locator('[aria-label="1日平均の睡眠時間"]')).toContainText("約9時間13分");
  await expect(page.locator('[aria-label="期間の合計睡眠時間"]')).toContainText("約27時間40分");
  await expect(page.locator(".timeline-segment")).toHaveCount(6);
  await expect(page.locator(".time-point")).toHaveCount(12);
  await page.getByLabel("時刻グラフの種類").selectOption("doze");
  await expect(page.locator(".time-point")).toHaveCount(2);
  await page.getByLabel("時刻グラフの種類").selectOption("all");
  await page.getByRole("button",{name:"月間",exact:true}).click();
  await expect(page.locator(".timeline-row")).toHaveCount(31);
  await expect(page.locator('[aria-label="記録日数"]')).toContainText("経過18日中・未記録15日");
  for(const chart of await page.locator(".chart-scroll").all()) {
    expect(await chart.evaluate(el=>{
      const viewport=el.getBoundingClientRect();const axis=el.querySelector(".chart-y-axis")!.getBoundingClientRect();
      return axis.left>=viewport.left-1&&axis.right<=viewport.right+1;
    })).toBe(true);
  }
  expect(await page.getByRole("button",{name:/^2026-10-17 約13時間30分 日別/}).evaluate(el=>{
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
      start_at:"2026-09-30T14:00:00.000Z",end_at:"2026-09-30T22:00:00.000Z",kind:"normal",intention:"intentional",
      start_accuracy:"estimated",end_accuracy:"exact",record_timezone:"Asia/Tokyo",note:null,
      created_at:"2026-10-01T00:00:00Z",updated_at:"2026-10-01T00:00:00Z",revision:1,
    }]));
  });
  await page.goto("./");await page.getByRole("button",{name:"画面を体験する",exact:true}).click();
  await menu(page,"分析");await page.getByLabel("分析の基準日").fill("2026-10-01");
  await expect(page.locator('[aria-label="期間の合計睡眠時間"]')).toContainText("約8時間");
  await expect(page.locator(".timeline-segment")).toHaveCount(2);
  await page.locator(".timeline-segment").first().focus();
  await expect(page.locator(".timeline-segment.highlighted")).toHaveCount(2);
  await page.locator(".timeline-segment.continues-before").click();
  const form=page.getByRole("dialog");await expect(form.getByLabel("開始日",{exact:true})).toHaveValue("2026-09-30");
  await form.getByLabel("終了時刻",{exact:true}).fill("08:00");await form.getByRole("button",{name:"保存する",exact:true}).click();
  await expect(form).not.toBeVisible();await expect(page.locator('[aria-label="期間の合計睡眠時間"]')).toContainText("約9時間");
  await page.getByRole("button",{name:"月間",exact:true}).click();
  await expect(page.locator('[aria-label="期間の合計睡眠時間"]')).toContainText("約8時間");
  await page.getByRole("button",{name:"前の分析期間",exact:true}).click();
  await expect(page.locator('[aria-label="期間の合計睡眠時間"]')).toContainText("約1時間");
});

test("未記録期間の平均を空欄にし、棒グラフの日付から日別記録を開く",async({page})=>{
  await enter(page);await menu(page,"分析");
  await page.getByRole("button",{name:/^2026-10-17 約13時間30分 日別/}).click();
  await expect(page.locator(".record-card")).toHaveCount(3);
  await menu(page,"分析");await page.getByLabel("分析の基準日").fill("2026-10-01");
  await expect(page.locator('[aria-label="1日平均の睡眠時間"] strong')).toHaveText("—");
  await expect(page.locator(".timeline-segment")).toHaveCount(0);
  await expect(page.getByText("この期間に該当する開始・起床の記録はありません。")).toBeVisible();
});
