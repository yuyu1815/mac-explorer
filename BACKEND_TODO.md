# バックエンド未実装機能一覧

フロントエンドのみで実装されている機能、およびRustバックエンドが必要な未実装機能の一覧。

---

## 1. UI状態管理（純粋なフロントエンド機能）

バックエンド不要。フロントエンドのローカル状態として完結。

| 機能 | 場所 | 実装状況 | 備考 |
|------|------|----------|------|
| 表示モード切替 | `Toolbar.tsx`, `ContextMenu.tsx` | ✅ 完了 | 8種類のビューモード（特大〜詳細） |
| ソート列切替 | `appStore.ts`, `ContextMenu.tsx` | ✅ 完了 | バックエンドの`list_files_sorted`を使用 |
| 隠しファイル表示切替 | `appStore.ts`, `Toolbar.tsx` | ✅ 完了 | `showHiddenFiles` - バックエンドにパラメータ渡し |
| 拡張子表示切替 | `appStore.ts`, `Toolbar.tsx` | ✅ 完了 | 純粋なフロントエンド表示制御 |
| チェックボックス表示切替 | `appStore.ts`, `Toolbar.tsx` | ✅ 完了 | 純粋なUI制御 |
| 選択状態管理 | `appStore.ts` | ✅ 完了 | `selectedFiles`, `focusedIndex` |
| タブ管理 | `appStore.ts` | ✅ 完了 | 複数タブ + 履歴 |
| ナビゲーション履歴 | `appStore.ts` | ✅ 完了 | 戻る/進む |
| 詳細ペイン表示切替 | `appStore.ts` | ✅ 完了 | `showDetailsPane` |
| リボンピン留め | `Toolbar.tsx` | ✅ 完了 | UIのみ |

---

## 2. バックエンド未実装の機能（プレースホルダー/無効化）

UIは存在するが、機能が実装されていないもの。

| 機能 | 場所 | 状態 | 備考 |
|------|------|------|------|
| **グループ化（Group By）** | `ContextMenu.tsx`, `Toolbar.tsx` | 🔲 プレースホルダー | `onClick={() => {}}` - 何もしない |
| **プレビューペイン** | `Toolbar.tsx` | 🚫 無効化 | ボタンが`disabled` |
| **オプションダイアログ** | `Toolbar.tsx` | 🚫 無効化 | ボタンが`disabled` |
| **共有機能** | `Toolbar.tsx` | 🚫 無効化 | 「共有機能は現在使用できません」表示 |
| **プログラムの変更** | `PropertiesDialog.tsx` | 🚫 無効化 | ボタンが`disabled` |
| **詳細属性の編集** | `PropertiesDialog.tsx` | 🚫 無効化 | ボタンが`disabled` |
| **プロパティ適用ボタン** | `PropertiesDialog.tsx` | 🚫 無効化 | 属性変更不可 |
| **プロパティからの名前変更** | `PropertiesDialog.tsx` | 🚫 無効化 | `readOnly` |

---

## 3. Rustバックエンドコマンドが必要な未実装機能

| 機能 | 必要なRustコマンド | 優先度 | 備考 |
|------|-------------------|--------|------|
| **ZIP圧縮/解凍** | `compress_files`, `extract_archive` | 🔴 高 | ファイラー基本機能 |
| **再帰的ディレクトリコピー** | `copy_files`の拡張 | 🔴 高 | 現在はファイルのみコピー可 |
| **ファイル属性変更** | `set_file_attributes` | 🟡 中 | 読み取り専用、隠し属性など |
| **ファイル内容検索** | `search_file_contents` | 🟡 中 | 現在はファイル名検索のみ |
| **ファイルハッシュ計算** | `calculate_file_hash` | 🟢 低 | MD5/SHA（プロパティ用） |
| **シンボリックリンク作成** | `create_symlink` | 🟢 低 | |
| **一括リネーム** | `bulk_rename` | 🟢 低 | |
| **ファイルプレビュー** | `get_file_preview` | 🟢 低 | テキスト/画像プレビュー |
| **操作のUndo/Redo** | `undo_operation`, `redo_operation` | 🟢 低 | 操作履歴管理 |

---

## 4. クリップボード機能の実装状況

| 機能 | 実装方法 | 状態 |
|------|----------|------|
| コピー/カット | フロントエンドの状態 + Rust `copy_files`/`move_files` | ✅ 動作中 |
| パスをコピー | `@tauri-apps/plugin-clipboard-manager` | ✅ 動作中 |

---

## 5. 優先実装順序

### Phase 1: 必須機能
1. **ZIP圧縮/解凍** - ファイラーの基本機能として必須
2. **再帰的ディレクトリコピー** - 現在フォルダコピーが不完全

### Phase 2: 重要機能
3. **ファイル属性変更** - プロパティダイアログが読み取り専用
4. **ファイル内容検索** - 高度な検索機能

### Phase 3: あると便利
5. グループ化機能
6. ファイルプレビュー
7. ファイルハッシュ計算
8. 一括リネーム

---

## 6. 現在実装済みのRustコマンド一覧

参考として、既に実装されているコマンド。

| コマンド | ファイル | 説明 |
|---------|------|------|
| `list_directory` | directory.rs | ディレクトリ内容一覧 |
| `list_files_sorted` | directory.rs | ソート・フィルタ付き一覧 |
| `complete_path` | directory.rs | パス補完 |
| `open_file_default` | utils.rs | デフォルトアプリで開く |
| `show_properties` | properties.rs | Finderの情報ウィンドウを開く |
| `get_basic_properties` | properties.rs | 基本プロパティ取得 |
| `get_detailed_properties` | properties.rs | 詳細プロパティ取得 |
| `get_detailed_properties_streaming` | properties.rs | ストリーミングでフォルダサイズ計算 |
| `create_directory` | file_ops.rs | ディレクトリ作成 |
| `copy_files` | file_ops.rs | ファイルコピー（再帰なし） |
| `move_files` | file_ops.rs | ファイル移動 |
| `delete_files` | file_ops.rs | ファイル削除（ゴミ箱対応） |
| `rename_file` | file_ops.rs | 名前変更 |
| `create_file` | file_ops.rs | 空ファイル作成 |
| `get_home_dir` | utils.rs | ホームディレクトリ取得 |
| `list_volumes` | volumes.rs | マウントボリューム一覧 |
| `get_parent_path` | utils.rs | 親ディレクトリパス取得 |
| `open_terminal_at` | utils.rs | ターミナルで開く |
