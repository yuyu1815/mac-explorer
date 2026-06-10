# 機能実装ステータス一覧

フロントエンド/Rustバックエンドの機能実装状況。（最終更新: 2026-06-10）

---

## 1. UI状態管理（純粋なフロントエンド機能）

| 機能 | 場所 | 実装状況 | 備考 |
|------|------|----------|------|
| 表示モード切替 | `Toolbar.tsx`, `ContextMenu.tsx` | ✅ 完了 | 8種類のビューモード（特大〜詳細） |
| ソート列切替 | `appStore.ts`, `ContextMenu.tsx`, `Toolbar.tsx` | ✅ 完了 | Viewタブ「並べ替え」メニューも配線済み |
| グループ化（Group By） | `utils/grouping.ts`, `MainPane.tsx` | ✅ 完了 | なし/名前/種類/サイズ/更新日時。タブごとに保持、全ビュー対応 |
| 隠しファイル表示切替 | `appStore.ts`, `Toolbar.tsx` | ✅ 完了 | |
| 選択した項目を表示しない | `Toolbar.tsx` | ✅ 完了 | `set_hidden` で選択ファイルに隠し属性付与 |
| 拡張子表示切替 | `appStore.ts`, `Toolbar.tsx` | ✅ 完了 | |
| チェックボックス表示切替 | `appStore.ts`, `Toolbar.tsx` | ✅ 完了 | |
| 選択状態管理 | `appStore.ts` | ✅ 完了 | `selectedFiles`, `focusedIndex` |
| タブ管理 / ナビゲーション履歴 | `appStore.ts` | ✅ 完了 | 複数タブ + 戻る/進む |
| ナビゲーションウィンドウ切替 | `settingsStore`, `App.tsx` | ✅ 完了 | SidePanel 表示/非表示（永続化） |
| 詳細ペイン表示切替 | `settingsStore` | ✅ 完了 | プレビューペインと排他 |
| プレビューペイン | `PreviewPane.tsx`, `Toolbar.tsx` | ✅ 完了 | Alt+P。テキスト/画像プレビュー、詳細ペインと排他 |
| 設定ダイアログ | `SettingsDialog`, `settingsStore` | ✅ 完了 | Toolbar「オプション」から開く |
| エラートースト通知 | `notificationStore.ts`, `Toaster.tsx` | ✅ 完了 | `.catch(console.error)` 握りつぶしを解消 |
| リボンピン留め | `Toolbar.tsx` | ✅ 完了 | UIのみ |

---

## 2. プロパティ / 共有

| 機能 | 場所 | 実装状況 | 備考 |
|------|------|----------|------|
| プログラムの変更 | `PropertiesDialog.tsx` | ✅ 完了 | `set_default_application` |
| プロパティ適用（読取専用/隠し属性） | `PropertiesDialog.tsx` | ✅ 完了 | `set_readonly` / `set_hidden` |
| プロパティからの名前変更 | `PropertiesDialog.tsx` | ✅ 完了 | `rename_file` |
| 詳細設定（詳細属性） | `PropertiesDialog.tsx` | ✅ 完了 | フラグ表示、xattr 一覧、quarantine 削除 |
| ファイルハッシュ表示 | `PropertiesDialog.tsx` | ✅ 完了 | MD5/SHA-1/SHA-256、オンデマンド計算 + コピー |
| 共有: Zip / メールで送信 / Finderで表示 | `Toolbar.tsx` Shareタブ | ✅ 完了 | AirDrop 等は「Finderで表示」経由（下記参照） |

---

## 3. Rustバックエンドコマンド

### 実装済み

| コマンド | ファイル | 説明 |
|---------|------|------|
| `list_directory` / `list_files_sorted` / `complete_path` | directory.rs | 一覧・ソート・パス補完 |
| `create_directory` / `create_file` / `rename_file` / `move_files` / `delete_files` | file_ops.rs | 基本ファイル操作（削除はゴミ箱） |
| `copy_files` | file_ops.rs | **再帰的ディレクトリコピー対応済み**（symlinkはリンクとして複製、自己内コピーはガード） |
| `batch_rename` | file_ops.rs | 一括リネーム |
| `create_symlink` | file_ops.rs | シンボリックリンク作成 |
| `compress_archive` / `extract_archive` | archive.rs, archive_core.rs | ZIP等の圧縮・展開（エラー収集方式） |
| `search_file_contents` | search.rs | 内容検索（500件打ち切り、バイナリ/10MB超スキップ）。UIは NavigationBar の検索モード切替 |
| `calculate_file_hash` | hash.rs | MD5/SHA-1/SHA-256 を1パスでストリーミング計算 |
| `get_file_preview` | preview.rs | プレビューペイン用（テキスト先頭64KB/画像はasset protocol） |
| `show_properties` / `get_basic_properties` / `get_detailed_properties(_streaming)` | properties.rs | プロパティ取得 |
| `set_readonly` / `set_hidden` / `set_default_application` | properties.rs ほか | 属性変更・関連付け |
| `list_xattrs` / `remove_xattr` | properties.rs | 拡張属性一覧・削除（quarantine対応） |
| `share_via_mail` / `reveal_in_finder` | utils.rs | Mail.app 添付 / Finder で表示 |
| `open_file_default` / `open_terminal_at` / `get_home_dir` / `get_parent_path` | utils.rs | ユーティリティ |
| `list_volumes` | volumes.rs | マウントボリューム一覧 |

### フロントエンド機能

| 機能 | 場所 | 備考 |
|------|------|------|
| Undo/Redo | `stores/undoStore.ts` | Cmd+Z / Cmd+Shift+Z。rename/move/copy/create 対応、上限50件 |
| クリップボード（コピー/カット/パスをコピー） | フロント状態 + plugin-clipboard-manager | 動作中 |

---

## 4. 残課題（意図的に未対応）

| 項目 | 理由 |
|------|------|
| 削除の Undo | ゴミ箱からの正確な復元（Put Back）はプログラムから保証できないため対象外 |
| プロパティウィンドウからのリネームの Undo | 別 webview ウィンドウのため Zustand インスタンスが分離しており記録不可 |
| ネイティブ共有シート（NSSharingServicePicker） | Tauri からの呼び出しが複雑なため「Finderで表示」で代替 |
| 詳細ビューの「列の追加」「すべての列のサイズ」 | 列構成が固定のためスコープ外（disabled のまま） |
| RAR / ISO / CAB 等の展開 | libarchive2 非対応のプロプライエタリ形式（設計どおり検出のみ） |

## 5. セキュリティ設定

- asset protocol の scope は `["**"]`（全パス許可、`tauri.conf.json`）。ファイラーとして任意の場所の画像プレビューを優先する意図的な選択。トレードオフとして、WebView で XSS が発生した場合に `asset:` 経由でローカルの任意ファイルが読める点は許容している
