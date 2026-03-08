# Xplorer

macOS 上で Windows エクスプローラーの UI/UX を再現するファイルマネージャです。
Tauri v2, React, TypeScript, Rust を使用して構築されています。

## プロジェクト構成

- `xplorer/`: アプリ本体（フロントエンド & バックエンド）
- `AGENTS.md`: AI エージェント向けの開発ガイドライン
- `GEMINI.md`: プロジェクト固有の命令セット

## 開発環境の準備

1. **Rust のインストール**
   [rustup.rs](https://rustup.rs/) に従い、Rust をインストールしてください。

2. **Node.js のインストール**
   最新の LTS バージョンを推奨します。

3. **依存関係のインストール**
   ```bash
   cd xplorer
   npm install
   ```

## 開発 (Development)

開発用サーバーを起動し、デスクトップアプリとして実行します：

```bash
cd xplorer
npm run tauri dev
```

## ビルド (Build)

配布用の実行ファイルを生成します：

```bash
cd xplorer
npm run tauri build
```

ビルドされたバイナリは `xplorer/src-tauri/target/release/bundle/` 配下に出力されます。

## 特徴

- **Windows 風 UI:** コンテキストメニュー、プロパティ画面、ナビゲーションバーを Windows エクスプローラー風に再現。
- **macOS 最適化:** プロパティ計算（ディレクトリサイズ等）に macOS ネイティブの Cocoa API (NSFileManager) を使用し、高速かつ正確な情報を取得。
- **高速なファイル操作:** Rust バックエンドによる高速なファイル I/O。
+
+## 参考・敬意 (Credits & Respect)
+
+- [duti](https://github.com/moretension/duti) - macOS のデフォルトアプリケーション設定機能を実装するにあたり、Launch Services API の利用方法を参考にさせていただきました。
