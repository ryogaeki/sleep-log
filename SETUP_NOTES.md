# Sleep Log：設定・公開の見返しノート

更新日：2026-10-31

- アプリ：**[https://ryogaeki.github.io/sleep-log/](https://ryogaeki.github.io/sleep-log/)**
- コードの保管先：[ryogaeki/sleep-log](https://github.com/ryogaeki/sleep-log)
- PC上の場所：`/home/wsl/projects/apps/sleep-log`
- クリック中心の設定手順：[SETUP.md](SETUP.md)

このノートは「何を操作したか」「何のためか」「どういう仕組みか」を後から思い出すためのもの。初回だけの操作と、普段の更新を区別する。ここに実際のパスワード・秘密キー・睡眠記録は書かない。

## まず全体像

| 使うもの | 担当すること | 入っているもの |
| --- | --- | --- |
| VS Code・WSL | PCでファイルを編集・実行する | アプリのソースコード |
| Git | コードの変更履歴を記録する | コミットという変更のまとまり |
| GitHub | コードを保管する | `ryogaeki/sleep-log` リポジトリ |
| GitHub Actions | 検査・ビルド・公開を自動で行う | 公開用のワークフロー |
| GitHub Pages | iPhoneやPCにアプリの画面を配る | HTML・JavaScript・CSS |
| Supabase Auth | 誰がログインしたかを確認する | アプリの利用者ID |
| SupabaseのDB | 睡眠記録を保存する | 日時・種類・推定・メモなど |

PCでコードを編集 → Gitで履歴を作る → GitHubへ送る → Actionsがビルド → Pagesの画面が更新される。

利用中は、ブラウザがPagesから画面を読み込み、ログインや睡眠記録の読み書きはSupabaseに問い合わせる。GitHubへのpushは、睡眠記録のバックアップではない。

## 1. Supabaseの無料プロジェクトを作る【初回】

**操作**：Supabase管理画面にGitHubでログインし、個人用Organizationを作る。Freeプランで `sleep-log` プロジェクトを作り、DB用パスワードを保管する。リージョンは利用可能ならTokyoを選ぶ。

**要約**：クラウド上に自分の保存先を用意した。

**軽い解説**：Organizationはプロジェクトの入れ物、プロジェクトはDBや認証をまとめた単位。ここでのGitHubログインは、Supabaseを管理するためのもの。睡眠アプリへのログインは手順3で別に設定する。

**確認**：Supabase上で `sleep-log` の画面が開ける。休止中の表示なら、白い「Resume project」から再開する。

## 2. 記録の表とアクセス制限を作る【初回・成功後は再実行しない】

**操作**：「SQL Editor」で `01_setup_sleep_log` というクエリーを作り、[用意済みのSQL](supabase/migrations/202610180001_sleep_log.sql) 全体を貼り付けて「Run」を押す。

**要約**：睡眠記録の入れ物と、保存時のルールを作った。

**軽い解説**：SQLはDBに指示する文章。`sleep_entries` は睡眠記録の表、`app_members` は利用を許可する本人のIDの表。RLSは、DB側で「本人の記録だけを読み書きできる」と判断するアクセス制限。時間の重複や不正な日時を拒否する処理も同時に作る。

**確認**：「Success」「No rows returned」などが表示され、Table Editorに2つの表がある。成功済みなら、普段の更新や分析機能の追加でこのSQLを再実行する必要はない。

SQLの説明メモは `--` で書ける。コメント部分は実行されない。

```sql
-- 自分のための説明メモ
/* 複数行の説明は、このように囲める */
```

## 3. GitHubでログインできるようにする【初回】

**操作**：Supabaseの「Authentication → Sign In / Providers → GitHub」でCallback URLをコピー。GitHubの自分のアカウントの「Settings → Developer settings → OAuth Apps」から `Sleep Log` を登録する。

| GitHub OAuth Appの項目 | 入れるもの |
| --- | --- |
| Application name | `Sleep Log` |
| Homepage URL | 初期確認は `http://localhost:3000/`、公開後はアプリの公開URL |
| Authorization callback URL／Redirect URI | Supabaseに表示されるCallback URL |

**要約**：GitHubに、アプリのログイン確認を担当してもらう設定をした。

**軽い解説**：OAuthは、GitHubに登録してあるパスワードを睡眠アプリに渡さずに、GitHubで本人確認してもらう仕組み。Callback URLは、GitHubが認証結果をSupabaseへ返す場所。

```text
https://＜SupabaseのプロジェクトID＞.supabase.co/auth/v1/callback
```

プロジェクトIDは、Supabaseの管理画面のアドレスの `/project/` の後にある識別文字列。アプリの名前 `sleep-log` とは別に発行される。Callback URLは、画面に出ている値をコピーする。

**続きの操作**：GitHubで発行したClient IDとClient secretをSupabaseのGitHub設定に入れ、「GitHubを有効化」はON、「Allow users without an email」は今回の設定ではOFFにして保存する。

**確認**：GitHubプロバイダが有効になっている。Client secretはSupabaseの設定欄だけに入れ、コードやチャットに貼らない。

## 4. ログイン後にアプリへ戻る場所を指定する【初回・公開URL変更時】

**操作**：Supabaseの「Authentication → URL Configuration」で設定する。

| 項目 | 現在使う値 |
| --- | --- |
| Site URL | `https://ryogaeki.github.io/sleep-log/` |
| Redirect URLs | 上の公開URLに加え、`http://localhost:3000/` と `http://127.0.0.1:3000/` |

初めてローカルだけで確認する段階では、Site URLも `http://localhost:3000/` にする。

**要約**：ログイン完了後に、正しいアプリの画面へ戻れるようにした。

**軽い解説**：Callback URLは「GitHub → Supabase」の戻り先、ここでのRedirect URLは「Supabase → 睡眠アプリ」の戻り先。GitHub PagesのURLは `/sleep-log/` と最後の `/` まで含める。

**確認**：GitHub OAuth AppのHomepage URLも公開URLにする。OAuth AppのCallback URLはSupabaseのURLのまま。

## 5. アプリに保存先の接続情報を教える【PCごとの初回・接続先変更時】

**操作**：Supabase上部の「Connect」で「Framework → Next.js → App Router」を選ぶ。ShadcnはOFFのまま下へスクロールし、Project URLとPublishable keyを確認する。キーは「Settings → API Keys」からも確認できる。

VS Codeで `package.json` と同じ場所に `.env.local` を作る。既にある場合はそのファイルを編集する。

```dotenv
NEXT_PUBLIC_SUPABASE_URL=＜コピーしたProject URL＞
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=＜コピーしたPublishable key＞
PAGES_BASE_PATH=
```

**要約**：PC上のアプリが、どのSupabaseへ接続すればよいかを設定した。

**軽い解説**：`.env.local` はローカル実行時の設定ファイル。`NEXT_PUBLIC_` で始まる値はブラウザにも渡る。ここには公開用キーだけを設定する。Gitの除外設定により、`.env.local` はGitHubへ送られない。

| 情報 | 扱い |
| --- | --- |
| Project ID、Project URL、Callback URL、Publishable key | アプリで使う公開前提の情報 |
| DBパスワード、GitHub Client secret、Supabase Secret key／service_role | 秘密にする。ブラウザ用のファイルへ入れない |

**確認**：ファイルを保存し、開発サーバーを再起動する。接続情報が表示されるだけで本人の権限が付くわけではなく、認証と手順2・7のアクセス制限が必要。

## 6. PCで起動して一度ログインする【普段の開発でも使う】

**操作**：VS Codeのターミナルで実行する。Node.jsは22以上を使用する。

```bash
cd /home/wsl/projects/apps/sleep-log
npm ci
npm run dev
```

`http://localhost:3000/` を開いて「GitHubでログイン」を押す。停止は `Ctrl+C`。

**要約**：手元のPCでアプリを動かし、GitHubログインを試した。

**軽い解説**：`npm ci` は必要なライブラリを決まった版で入れるコマンド。初回や依存関係の変更後に使う。`npm run dev` は開発用サーバーを起動するコマンドで、普段の起動はこちらだけでよい。`localhost` はこのPC自身を指す。

**確認**：初回は「このアカウントには利用許可がありません」が出ても正常。GitHubで本人確認はできたが、アプリの許可表にはまだ登録されていない状態なので、次へ進む。体験モードは架空データの一時保存で、本番の睡眠記録には使わない。

## 7. 自分だけにアプリの利用を許可する【本人アカウントの初回】

**操作**：Supabaseの「Authentication → Users」で今ログインした自分のUUIDをコピー。SQL Editorで `02_allow_my_account` というクエリーを作って実行する。

```sql
-- Supabase Authenticationにある本人のUUIDを入れる
insert into public.app_members (user_id)
values ('ここを本人のUUIDに置き換える')
on conflict (user_id) do nothing;
```

**要約**：ログインできる人のうち、自分のIDだけに記録画面を使う許可を出した。

**軽い解説**：認証は「誰か」を確認する処理、利用許可は「その人が何をできるか」を決める処理。UUIDはSupabaseの利用者IDで、GitHubのユーザー名 `ryogaeki` やプロジェクトIDとは別のもの。

**確認**：アプリに戻って「利用許可を再確認」を押す。日別記録の画面が開く。確認用の記録を1件保存し、再読み込みしても残ることを確かめる。

## 8. GitHubへコードを保管する【初回】

**操作**：GitHubで公開リポジトリ `ryogaeki/sleep-log` を用意し、PC上のアプリフォルダと接続する。今のプロジェクトでは初期設定済みなので、普段の変更は手順12を使う。

初めて別の場所に作るときの流れ：

```bash
git init
git add .
git commit -m "Initial Sleep Log app"
git branch -M main
git remote add origin https://github.com/ryogaeki/sleep-log.git
git push -u origin main
```

**要約**：PCのコードをGitで管理し、GitHubに送った。

**軽い解説**：`git init` は今のフォルダをGit管理にする処理。`origin` はGitHub上の保存先につけた呼び名、`main` は主に使うブランチの名前。以前の `YOUR_GITHUB_USERNAME` という表記には、自分の名前 `ryogaeki` を入れる。

**確認**：GitHubで `src`、`package.json`、`.github/workflows` などが見える。ファイルを配置するリポジトリのルートは、この `sleep-log` フォルダ。`projects` 全体を送る操作ではない。

## 9. GitHub上にも公開用の接続情報を登録する【初回・接続情報変更時】

**操作**：リポジトリの「Settings → Secrets and variables → Actions → Variables」で、次の2つを登録する。

| Name | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key |

**要約**：GitHubで公開版を作るときにも、保存先を分かるようにした。

**軽い解説**：PCの `.env.local` はGitHubには送られないので、公開版には別に設定が必要。今回のワークフローは `Variables` タブの値を読む。`Secrets` タブに入れただけでは、このワークフローには渡らない。

**確認**：2つの名前が正確に登録されている。`PAGES_BASE_PATH` はワークフローがリポジトリ名から設定する。

## 10. GitHub Pagesでアプリを公開する【初回・以降は自動更新】

**操作**：リポジトリの「Settings → Pages → Build and deployment → Source」を「GitHub Actions」にする。コードをmainへpushし、「Actions」で `Check and deploy GitHub Pages` の完了を待つ。

**要約**：コードをブラウザで使えるファイルに変換して、公開した。

**軽い解説**：ビルドは、TypeScriptやReactのコードをブラウザ向けのHTML・JavaScript・CSSに変換する工程。Actionsは、型の確認、計算とDBルールのテスト、PC／スマホ幅の操作テスト、公開版のビルド、Pagesへの配置を順番に行う。

**確認**：「Actions」に緑のチェックが付き、[公開URL](https://ryogaeki.github.io/sleep-log/) が開く。接続情報を変更したときも、Actionsを再実行してビルドし直す。

## 11. 公開版のログインとiPhoneでの共有を確認する【初回・URL変更時】

**操作**：手順4の公開URLをSupabaseへ登録し、GitHub OAuth AppのHomepage URLも公開URLにする。iPhoneのSafariでアプリを開き、PCと同じGitHubアカウントでログインする。

**要約**：端末が変わっても同じ本人の保存先を開けることを確認した。

**軽い解説**：iPhoneの `localhost` はiPhone自身を指すので、普段使うのはPagesの公開URL。記録はSupabase側に保存されるので、同じ本人でログインすれば同じ記録が見える。

**確認**：PCで保存した記録がiPhoneでも見える。iPhoneで追加・編集した記録が、PCでも再読み込みすると見える。

## 12. 普段、アプリを更新するとき【繰り返し使う】

**操作**：ファイルを編集し、変更内容を確認してからGitHubへ送る。

```bash
cd /home/wsl/projects/apps/sleep-log
git status
git diff
npm test
npm run typecheck
npm run build
git add .
git commit -m "Describe the change"
git push
```

`Describe the change` は「Add sleep analytics」など、今回の変更が分かる文章に置き換える。コメントの文章は日本語でもよい。

**要約**：変更を確認して履歴を作り、公開版を更新した。

**軽い解説**：`status` は変更ファイルの一覧、`diff` は変更内容、`add` は次のコミットに含めるファイルの指定、`commit` は履歴の作成、`push` はGitHubへの送信。push後にActionsが公開まで担当する。初期設定の `git init` や `git remote add origin` を毎回繰り返す必要はない。

**確認**：「Actions」の最新処理が成功した後に公開URLを再読み込みする。`git status` では、実際の記録のバックアップや秘密情報が送信対象になっていないことも確認する。

## 13. 記録を手元にも残す【定期的に行う】

**操作**：アプリの「データ管理 → バックアップを書き出す」でJSONを保存する。復元は「バックアップから復元する」で、そのファイルを選ぶ。

**要約**：クラウドとは別に、記録のコピーを保管する。

**軽い解説**：JSONには睡眠記録が入っている。復元は、今の保存先に足りないIDの記録だけを追加し、現在の編集済み記録を古い内容で上書きしない。GitHubへコードを送ることとは別の操作。

**確認**：保存したJSONの場所が分かる。記録を大きく変更・削除する前にも書き出しておく。

## 14. 休止・エラーが出たときの見方

| 表示・症状 | 意味と確認先 |
| --- | --- |
| Project is paused | Supabaseが休止中。「Resume project」で再開する。無料プランの休止・再開期限は画面と公式説明を確認する |
| SQL Editorを開けない | プロジェクトが休止中でないか確認。再開後は左の `>_` のようなアイコンを開く |
| relation already exists | 初期SQLの表が既にある可能性。成功済みの初期SQLを繰り返さず、Table Editorで確認する |
| クラウド保存は準備中 | URL・公開用キー・ローカルサーバーの再起動、または公開用Variablesと再ビルドを確認する |
| 利用許可がありません | Authenticationの本人UUIDが `app_members` にあるか確認する |
| ログイン後にlocalhostへ戻る | SupabaseのSite URL・Redirect URLsに、公開URLの `/sleep-log/` まで登録する |
| fatal: not a git repository | 作業フォルダにGit管理情報がない。フォルダを確認し、初回なら `git init` が必要 |
| remote origin already exists | 保存先は既に登録されている。`git remote -v` で確認する |
| GitHub Pagesの更新が見えない | Actionsの最新処理と公開先を確認し、完了後にブラウザを再読み込みする |

## 15. iPhoneのホーム画面に同じアイコンで追加する

**操作**：公開版の更新完了後、iPhoneのSafariで [Sleep Log](https://ryogaeki.github.io/sleep-log/) を開く。「共有 → ホーム画面に追加」を選び、「Webアプリとして開く」が表示されればONにして追加する。

**要約**：ブラウザと同じ「薄紫の背景＋月と星」のアイコンで、ホーム画面から起動できるようにした。

**軽い解説**：ブラウザ用の `public/icon.svg` から、iPhone向けの180×180ピクセルのPNG画像 `public/apple-touch-icon.png` を作っている。背景は不透明な薄紫にしてあり、角の形はiOS側で整えられる。`src/app/layout.tsx` で `apple-touch-icon` を指定し、GitHub Pagesの `/sleep-log/` 配下からも画像を読み込めるようにする。

**確認**：「ホーム画面に追加」のプレビューに、月と星のアイコンが出る。既に置いたアイコンの見た目が古い場合は、入力中の記録を保存してから、古いホーム画面アイコンを削除してSafariから追加し直す。再ログインが必要な場合は同じGitHubアカウントを使う。

元のSVGを変更したときは、PNGも再生成する。開発環境に `rsvg-convert` がある場合のコマンド：

```bash
rsvg-convert --width=180 --height=180 --background-color='#eeecfb' --output=public/apple-touch-icon.png public/icon.svg
```

これはホーム画面用アイコンの設定。オフラインでの保存・同期は別の機能として扱う。

## 参考にした公式の説明

- [Supabase：GitHubログイン](https://supabase.com/docs/guides/auth/social-sign-in/auth-github)
- [Supabase：ログイン後の戻り先](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase：公開用キーと秘密キー](https://supabase.com/docs/guides/getting-started/api-keys)
- [Supabase：無料プロジェクトの休止](https://supabase.com/docs/guides/platform/free-project-pausing)
- [GitHub：Pagesのワークフロー](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [Apple：ホーム画面用のアイコン設定](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html)
