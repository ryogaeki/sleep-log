# Sleep Log の起動とクラウド保存の設定

公開URL：[https://ryogaeki.github.io/sleep-log/](https://ryogaeki.github.io/sleep-log/)

この文書は初期設定・再設定の操作手順。各操作の目的も含めて見返す場合は [SETUP_NOTES.md](SETUP_NOTES.md) を参照。完了済みの初期SQLを再実行する必要はない。第2段階の分析機能も、既存のDB設定で動作する。

## 1. まず画面を動かす

Node.js 22以上を使う。

```bash
cd /home/wsl/projects/apps/sleep-log
npm ci
npm run dev
```

表示された `http://localhost:3000/` を開き、「画面を体験する」を押す。架空の睡眠記録で、追加・編集・削除・カレンダー・JSONバックアップと復元を試せる。

体験モードの変更はそのタブの一時領域にだけ保存する。タブを閉じた後の復元や、ほかの端末との共有は保証しない。本番用の記録には使わない。

公開する静的ファイルもローカルで確認できる。

```bash
npm run build
npm start
```

停止は `Ctrl+C`。実際の保存先を設定していなければ、こちらも体験モードを案内する。

## 2. Supabase の無料プロジェクトを作る

1. [Supabase](https://supabase.com/) にアクセスし、GitHubアカウントで管理画面にログインする。
2. 必要なら個人用のOrganizationを作成し、Freeプランを選ぶ。
3. 「New project」から、名前を `sleep-log` としてプロジェクトを作る。
4. DB用のパスワードを設定して自分で保管し、利用できる日本のリージョンを選ぶ。
5. プロジェクトの準備が完了するまで待つ。

ここでのSupabase管理画面へのGitHubログインと、作る睡眠アプリへのGitHubログインは別の設定。アプリ側のログインは次の手順で用意する。

Freeのまま利用する。有料アップグレードや有料追加機能は、この手順に含めていない。無料枠の条件は [STORAGE.md](STORAGE.md) を参照。

## 3. 保存する表とルールを用意する

Supabaseの「SQL Editor」で新しいクエリーを開き、名前を `01_setup_sleep_log` とし、[DB定義ファイル](supabase/migrations/202610180001_sleep_log.sql) の内容をすべて貼り付けて実行する。プロジェクトが休止中なら、先に「Resume project」で再開する。

このファイルは次をまとめて作る。

- 本人の利用許可を入れる `app_members`
- 睡眠記録を入れる `sleep_entries`
- 本人以外からの読み書きを拒否するRLS
- 時間帯の重複・不正な日時を拒否する制約
- 全件バックアップと一括復元の関数

新しく作った空のプロジェクトで1回実行するためのファイル。成功後に繰り返し実行する必要はない。途中で失敗した場合はトランザクション全体が取り消されるので、エラー内容を確認してから再実行する。

## 4. アプリへのGitHubログインを設定する

Supabaseの「Authentication → Sign In / Providers」（表示名がProvidersの場合もある）からGitHubを開き、Callback URLをコピーする。

```text
https://＜プロジェクトID＞.supabase.co/auth/v1/callback
```

次に、GitHubの「Settings → Developer settings → OAuth Apps → New OAuth App」で登録する。

| 項目 | 最初に入力する値 |
| --- | --- |
| Application name | Sleep Log |
| Homepage URL | `http://localhost:3000/` |
| Authorization callback URL | SupabaseからコピーしたCallback URL |

GitHubが発行したClient IDとClient secretを、SupabaseのGitHubプロバイダー設定に入力して有効にする。Client secretはSupabase側だけに設定し、アプリのコード・公開用環境変数・GitHubのRepository variablesには入れない。

「GitHubを有効化」はON、「Allow users without an email」は、今回の初期設定ではOFFにして保存する。

Supabaseの「Authentication → URL Configuration」で、まず次を設定する。

| 項目 | 値 |
| --- | --- |
| Site URL | `http://localhost:3000/` |
| Redirect URLs | `http://localhost:3000/` と `http://127.0.0.1:3000/` |

公開する際はSite URLを公開URLに変更し、そのURLをRedirect URLsにも追加する。末尾の `/` とリポジトリ名のパスも含める。

## 5. アプリに接続情報を設定する

Supabaseの「Connect → Framework → Next.js → App Router」で、ShadcnはOFFのまま下にスクロールし、Project URLと公開用のPublishable keyを確認する。キーを個別に確認する場合は「Settings → API Keys」を使う。従来の `anon public` キーも使えるが、新しく設定する場合はPublishable keyを使う。

`.env.example` を `.env.local` にコピーし、次の2行を埋める。

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://＜プロジェクトID＞.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=＜公開用のPublishable key または anon public key＞
PAGES_BASE_PATH=
```

DBパスワード、Client secret、`secret` / `service_role` キーは、このファイルに入れない。`.env.local` はGitの対象外になっている。公開用キーを間違えて管理用キーにした場合、アプリとビルドで拒否する。

`npm run dev` を一度停止してから再起動し、「GitHubでログイン」を押す。

## 6. 自分のアカウントだけを許可する

最初のアプリへのログイン後は、まだ「このアカウントには利用許可がありません」と表示される。これが最初の正常な状態。

1. Supabaseの「Authentication → Users」で、いまログインした本人のユーザーを見つける。
2. そのユーザーのUUIDをコピーする。
3. SQL Editorで `02_allow_my_account` というクエリーを作り、次を実行する。文字列の中を本人のUUIDに置き換える。

```sql
insert into public.app_members (user_id)
values ('ここを本人のUUIDに置き換える')
on conflict (user_id) do nothing;
```

アプリに戻り「利用許可を再確認」を押す。日別の記録画面が開けば接続完了。

他人のGitHubアカウントでログインされても、許可表にいない限り記録を読み書きできない。許可表はアプリから追加・変更できない。

実際の記録を1件保存して再読み込みし、内容が残ることを確認する。PCとiPhoneで同じGitHubアカウントを使えば、同じ保存先の記録を扱える。

## 7. GitHub Pagesで公開する

このプロジェクトのフォルダをルートにした、公開リポジトリ `sleep-log` を用意する。現在のフォルダはコード・仕様書のみを管理し、実際の睡眠記録やバックアップファイルはコミットしない。

GitHubリポジトリの次の場所を設定する。

1. 「Settings → Pages → Build and deployment → Source」を **GitHub Actions** にする。
2. 「Settings → Secrets and variables → Actions → Variables → New repository variable」で次の2つを作る。

| Variable名 | 値 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key または anon public key |

コードをmainブランチへpushすると、[公開用ワークフロー](.github/workflows/deploy-pages.yml) が型検査・ロジックとDBのテスト・PCとスマホ幅の操作テストを行い、接続情報を使ってビルドして公開する。公開用の変数がない場合は公開前に止まる。

このプロジェクトの公開URL：

```text
https://ryogaeki.github.io/sleep-log/
```

このURLをSupabaseのSite URLとRedirect URLsに設定する。GitHub OAuth AppのHomepage URLも公開URLへ変更する。OAuth AppのCallback URLは引き続きSupabaseのURLを使う。

公開情報が変更された場合は、Actionsを再実行してビルドし直す。GitHubのリポジトリ名を変えた場合、公開URLと認証後の戻り先も合わせて変更する。

## 8. バックアップの使い方

アプリの「データ管理 → バックアップを書き出す」で、すべての睡眠記録を含むJSONファイルを保存する。定期的に行い、記録を大きく編集・削除する前にも残すとよい。

「バックアップから復元する」は、現在の保存先に足りないIDの記録だけを追加する。同じIDの現在の記録を、古いファイルで上書きしない。時間が重なる場合は、エラーを確認してから記録を見直す。一部だけ復元される状態は作らない。

Supabase Freeが休止したときは、Supabaseの管理画面で対象プロジェクトの「Resume project」から再開する。バックアップはクラウドの同期とは別に保管する。

## 9. 開発時の確認

```bash
npm test
npm run typecheck
npm run build
```

ブラウザーの操作テストは、最初にPlaywright用のChromiumをインストールする。

```bash
npx playwright install chromium
npm run test:browser
```

GitHub Pagesのパスも含めて確認する場合は `TEST_BASE_PATH=/sleep-log npm run test:browser` を使う。公開用ワークフローもリポジトリ名のパスで操作を検証する。

既存のChromeを使う場合は `BROWSER_EXECUTABLE_PATH` にその実行ファイルのパスを設定できる。操作テストは接続情報を空にした体験モードで行い、実際の記録を操作しない。

DBのテストは、ローカルのPGlite（PostgreSQL）に認証のテスト用情報を用意し、実際のDB定義ファイルを適用して行う。本番のSupabaseやGitHub OAuthへの接続を検証するものではない。
