// パス操作ヘルパー。各所のローカル定義が分岐しないよう一本化する。
// 本プロジェクトは macOS 専用のため区切り文字は '/' のみ。

export const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1);

export const parentDir = (path: string) => path.slice(0, path.lastIndexOf('/')) || '/';

export const joinPath = (dir: string, name: string) => (dir.endsWith('/') ? `${dir}${name}` : `${dir}/${name}`);

// 末尾スラッシュ付きで渡されたディレクトリパスを正規化する（ルート '/' は除く）。
// parentDir(src) === dest の同一ディレクトリ判定が表記ゆれで壊れないようにするため。
export const normalizeDir = (dir: string) => (dir.length > 1 && dir.endsWith('/') ? dir.slice(0, -1) : dir);
