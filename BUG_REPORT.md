# UI操作系バグ洗い出しレポート

調査日: 2026-06-11 / 調査方法: サブエージェント4並列（IPC契約・ファイル操作・ナビゲーション/選択・検索/プレビュー/設定）

---

## P0 — 操作系全滅の主因候補（確実なバグ）

### 1. クリック選択の multi/exclusive フラグが反転
- **箇所**: `xplorer/src/hooks/useFileSelection.ts:16-34` ＋ `xplorer/src/components/features/file-manager/MainPane.tsx:925, 1006, 1074, 1142, 1214`
- **症状**: 通常クリックで複数選択になり、Cmd+クリックで単一選択になる（選択操作が全ビューで逆挙動）
- **原因**: MainPane は `toggleSelection(path, e.ctrlKey || e.metaKey, ...)` と渡すが、useFileSelection 側は第2引数 `multi=true` で「既存選択を保持」と解釈。呼び出し側と定義側で意味が逆
- **修正方針**: 呼び出し側を `!e.ctrlKey && !e.metaKey`（exclusive）に統一するか、hook 側の解釈を反転

### 2. アーカイブ操作の IPC 契約不一致（圧縮・解凍が全く動かない）
- **箇所**: `xplorer/src/services/ipc.ts:11-12` ⇔ `src-tauri/src/commands/archive.rs`
- **症状**: 圧縮・解凍ボタンが無反応／エラー
- **原因**（3点セット）:
  1. `compress_archive` に必須の `format` 引数を渡していない
  2. `extract_archive` の引数名が `sourcePath` だが Rust 側は `archive_path`（camelCase 変換後 `archivePath`）を期待
  3. Rust 側必須の `channel: Channel<Progress>` が ipc.ts の型に存在しない（ProgressWindow.tsx は直接 invoke していて二重実装）
- **修正方針**: ipc.ts のシグネチャを Rust 側に合わせて修正、ProgressWindow との実装を一本化

### 3. 設定の snake_case / camelCase 不整合（保存しても反映されない）
- **箇所**: `src-tauri/src/commands/settings.rs:9-40` ⇔ `xplorer/src/types/settings.ts`
- **症状**: 設定変更→保存→再起動/再読込で値が落ちる・undefined になる
- **原因**: Rust 側 `#[serde(rename_all = "camelCase")]` と TS 側 `DEFAULT_APP_SETTINGS` のキーが完全一致しておらず、JSON 往復でキー欠落の可能性。既存 settings.json に snake_case キーが残っていると読めない
- **修正方針**: Rust/TS の型を完全統一し、旧キーの読み込みマイグレーションを追加

### 4. Undo（移動）の元位置情報が壊れている
- **箇所**: `xplorer/src/stores/undoStore.ts:26, 44-48`、`xplorer/src/components/layout/Toolbar.tsx:127`、`MainPane.tsx:525-527, 628-629`
- **症状**: 移動の Undo でファイルが元の場所に戻らない。複数の異なるディレクトリから移動した場合は最初のファイルのディレクトリにしか戻らない
- **原因**: `record({ type: 'move', sources, originalDir })` の `sources` に「移動後パス」を渡しているが、undoStore は「移動前パス」を仮定。さらに `originalDir` は先頭ファイルのディレクトリのみ記録
- **修正方針**: FileOp の move 型を `{ originalPaths: string[]; dest: string }` に再設計し、ファイルごとの元パスを記録

---

## P1 — 機能単位で壊れている（確実〜ほぼ確実）

### 5. list/icon/tiles/content ビューで Shift/Cmd 選択が効かない
- **箇所**: `MainPane.tsx:1027, 1095, 1163, 1245`
- **原因**: `hookToggleSelection(file.path, false, false, index)` と修飾キーを無視してハードコード（detail ビューのみ対応済み）

### 6. 内容検索の race condition ＋ デバウンス欠如
- **箇所**: `xplorer/src/hooks/useContentSearch.ts:39-56`、`NavigationBar.tsx:327`
- **症状**: 入力途中の古いクエリの結果が後着して最新結果を上書き。キー入力毎に IPC 発行
- **修正方針**: debounce ＋ cancelled フラグ（または AbortController）

### 7. NavigationBar が存在しないパスへ直接遷移
- **箇所**: `xplorer/src/components/layout/NavigationBar.tsx:177, 289-304`
- **原因**: 他箇所（ContextMenu/Toolbar）は `list_directory` で検証後に `setCurrentPath` するが、NavigationBar は無検証で直呼び出し。LocationNotAvailable ダイアログが出ない

### 8. マーキー（ドラッグ範囲）選択がグループ化時にズレる
- **箇所**: `xplorer/src/hooks/useFileSelection.ts:73-96`
- **原因**: DOM の `.file-item` 順序（グループ化・ソート後）と `files` 配列の順序が不一致のまま index で対応付け

### 9. プレビューペインの表示 ON/OFF が設定 UI に存在しない
- **箇所**: `SettingsDialog.tsx`（コントロール欠落）、`settingsStore.ts:96`（setter 欠落）
- **原因**: `showPreviewPane` の UI と `setShowPreviewPane` が未実装

### 10. プレビューの切替キャンセルが不完全
- **箇所**: `xplorer/src/components/layout/PreviewPane.tsx:30-46`
- **症状**: ファイルを素早く切り替えると前のファイルのプレビューが表示されることがある

---

## P2 — エッジケース・設計確認事項

| # | 箇所 | 内容 |
|---|------|------|
| 11 | `Toolbar.tsx:298` | `await win.once('tauri://error', ...)` — once は Promise を返さず await が無意味。エラー検出漏れ |
| 12 | `useFileSelection.ts:19-24` | 初回 Shift+クリック時 `lastSelectedIndex === -1` で範囲選択が単一選択にフォールバック |
| 13 | `appStore.ts:51-65` | タブ初期化直後の `setCurrentPath` で履歴に同一パスが二重 push される疑い |
| 14 | `appStore.ts:73` | `goBack` の `historyIndex - 1` に負値ガード不足 |
| 15 | `useFileOperations.ts:35-42` | delete が Undo 非対応（コメントで意図的と明記。設計判断の確認要） |
| 16 | `MainPane.tsx:228, 254, 281` | this-pc ビューで `toggleSelection(..., -1)` 固定のため範囲選択不能 |
| 17 | `notificationStore.ts:15` | エラートーストも 5 秒固定で自動消去（長文が読み切れない） |
| 18 | `PropertiesDialog.tsx:104` | `default_application` の比較がアプリ名か bundle_identifier か曖昧 |

---

## 検証済み（問題なし）

- invoke コマンド20個すべて `generate_handler!` に登録済み（アーカイブ以外の引数名も一致）
- `fs-change` イベントの listen/emit 一致
- FileEntry / FilePreview 等の TS 型と Rust serde の整合
- TrashConfirmDialog / OverwriteConfirmDialog の resolve 分岐は正しい

---

# 第2弾調査（2026-06-11）: D&D・貼り付け・サイレント失敗

P0 4件の修正後、「D&Dが使えない」「同一ディレクトリに貼り付けできない」の報告を受けた追加調査。

> **対応状況（2026-06-11）**: R1〜R6 およびサイレント失敗（影響大・中）は修正済み。同一dirコピーは Windows 互換の「xxx - コピー (n)」連番生成で対応。貼り付けロジックは services/fileTransfer.ts（copyWithConfirm / moveWithConfirm）に一本化。未実装機能（外部D&D・SidePanel/パンくずドロップ）は未着手。

## 確定原因（報告された2症状）

### R1. D&Dが全く動かない — tauri.conf.json の設定欠落
- **箇所**: `xplorer/src-tauri/tauri.conf.json`（windows 設定）
- **原因**: Tauri v2 はデフォルトでネイティブ drag-drop ハンドラが有効で、WebView 内の HTML5 DnD イベント（drop / dataTransfer）を奪う。MainPane の `draggable` ベース実装は設定上動作不能
- **修正方針**: windows 設定に `"dragDropEnabled": false` を追加（ProgressWindow 等の動的ウィンドウは WebviewWindow オプションでも指定）

### R2. 同一ディレクトリへの貼り付けが全件エラー — starts_with ガードの過剰判定
- **箇所**: `xplorer/src-tauri/src/commands/file_ops.rs:54`
- **原因**: `target.starts_with(src)` は同一パスでも true（自分自身を含む）ため、同じフォルダへのコピーが「Cannot copy into itself」で全件拒否される。さらにフロントが catch で console.error するだけなので無反応に見える
- **修正方針**: 同一パス時はエラーではなく「xxx - コピー」等のユニーク名を生成（Windowsエクスプローラー互換）。`/a → /a/b` の真の自己内包だけ弾く

## 追加で発見した確実なバグ

| # | 箇所 | 内容 | リスク |
|---|------|------|--------|
| R3 | Toolbar/MainPane/ContextMenu の貼り付け全箇所 | **上書き確認が完全に欠落**。copy_files は同名を黙って上書き、move_files (fs::rename) も黙って置換。appStore の confirmOverwrite は存在するのに未使用 | データ消失（最重要） |
| R4 | MainPane.tsx（コンテナ） | ビューの空白領域へのドロップが未実装。フォルダアイテム上にしかドロップできない | 機能欠落 |
| R5 | MainPane.tsx:496 | dragLeave が子要素への移動でも発火し dragTarget が無条件クリア → ハイライトがちらつく | UX |
| R6 | MainPane.tsx Cmd+V / ContextMenu.tsx handleAction | try/catch 自体が無く unhandled rejection。ContextMenu はエラー時に onClose が呼ばれずメニューが残る | UX |

## サイレント失敗（エラーがUIに出ない）約20箇所

notifyError / Toaster が存在するのに `catch { console.error }` 止まり。ユーザーには「無反応」に見える。

- **影響大**: Toolbar.tsx 88, 129, 149, 168, 188, 204, 230, 379（貼り付け・コピー先・移動先・削除・開く・新規作成・再読込）/ MainPane.tsx 530（D&D）
- **影響中**: ContextMenu.tsx 83, 97（再読込）/ NavigationBar.tsx 82, 135 / useFileSystem.ts 43（error が return されるが MainPane で未表示）/ PropertiesDialog.tsx 185
- **影響小**: ProgressWindow.tsx 138, 140 / useFileSystem.ts 65（watch_path）

## 未実装機能（バグではなく欠落）

- Finder → xplorer への外部ファイルドロップ（`tauri://drag-drop` の listen なし）
- xplorer → Finder へのドラッグアウト
- SidePanel・パンくず・タブへのドロップ
