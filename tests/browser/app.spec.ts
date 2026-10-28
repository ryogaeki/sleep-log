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
