//! ファイルおよびディレクトリの基本操作（新規作成、コピー、移動、削除、リネーム）を提供するコマンド。
//!
//! macOS固有のゴミ箱（Trash）機能の統合や、バッチリネーム機能を含みます。

use serde::Serialize;
use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};

/// 新しいディレクトリを作成します。親ディレクトリが存在しない場合は再帰的に作成します。
#[tauri::command]
pub async fn create_directory(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_file(path: String) -> Result<(), String> {
    fs::File::create(&path)
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// コピー結果。部分失敗があっても成功分の `created_paths` を保持する
/// （Undo が成功分を正しく削除できるようにするため、Err でパスを捨てない）。
#[derive(Serialize)]
pub struct CopyResult {
    pub created_paths: Vec<String>,
    pub errors: Vec<String>,
}

/// 指定された複数のファイル・ディレクトリを宛先ディレクトリにコピーします。
///
/// ディレクトリは再帰的にコピーします。シンボリックリンクは実体を辿らずリンクとして複製します。
/// 同名衝突時はファイルを上書き、ディレクトリは既存ディレクトリへマージします（`fs::copy` の挙動に合わせる）。
/// ファイル単位のエラーは収集して処理を継続し、成功分のコピー先パス（同一ディレクトリへの
/// コピーでは `xxx - コピー` 連番名）と合わせて返します。
#[tauri::command]
pub async fn copy_files(sources: Vec<String>, dest: String) -> Result<CopyResult, String> {
    Ok(copy_files_impl(&sources, &dest))
}

fn copy_files_impl(sources: &[String], dest: &str) -> CopyResult {
    let dest_dir = Path::new(dest);
    let mut created: Vec<String> = Vec::new();
    let mut errors: Vec<String> = Vec::new();

    for src in sources.iter().map(Path::new).filter(|src| src.symlink_metadata().is_ok()) {
        match copy_entry(src, dest_dir) {
            Ok(target) => created.push(target.to_string_lossy().into_owned()),
            Err(e) => errors.push(e),
        }
    }

    CopyResult { created_paths: created, errors }
}

/// 1つのソース（ファイル/ディレクトリ/シンボリックリンク）を宛先ディレクトリ配下へコピーします。
/// コピー先のフルパスを返します。
fn copy_entry(src: &Path, dest_dir: &Path) -> Result<PathBuf, String> {
    let name = src
        .file_name()
        .ok_or_else(|| format!("Invalid source path: {}", src.display()))?;
    let target = dest_dir.join(name);

    // 同一ディレクトリへのコピーは Windows 互換のユニーク名（`xxx - コピー`）を生成する。
    if target != src {
        copy_recursive(src, &target)?;
        return Ok(target);
    }

    let reserved = reserve_unique_copy_target(src, dest_dir, name)?;
    if let Err(e) = copy_recursive(src, &reserved) {
        // 予約で作った空エントリを残さない（コピー本体が失敗した場合のみ）
        remove_reservation(&reserved);
        return Err(e);
    }
    Ok(reserved)
}

/// 同一ディレクトリへのコピー時に衝突しないユニークなパスを「作成して予約」してから返します。
/// `file.txt` → `file - コピー.txt` → `file - コピー (2).txt` → …
///
/// exists() で空きを確認してから後でコピーする方式だと、その間に他プロセスが同名を
/// 作成した場合に黙って上書きしてしまう（TOCTOU）ため、`create_new` / `create_dir` で
/// アトミックに確保する。確保した空エントリはこの後の copy_recursive が中身で埋める。
fn reserve_unique_copy_target(src: &Path, dest_dir: &Path, name: &OsStr) -> Result<PathBuf, String> {
    let name = name.to_string_lossy();
    let (stem, ext) = split_stem_ext(&name);
    let src_is_dir = src
        .symlink_metadata()
        .map(|m| m.is_dir())
        .unwrap_or(false);

    let suffixes = std::iter::once(String::new()).chain((2..).map(|n| format!(" ({n})")));
    // 上限は連番暴走（権限エラー等で永遠に確保できないケース）の保険
    for suffix in suffixes.take(10_000) {
        let candidate = dest_dir.join(format!("{stem} - コピー{suffix}{ext}"));
        let reserved = if src_is_dir {
            fs::create_dir(&candidate).is_ok()
        } else {
            fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&candidate)
                .is_ok()
        };
        if reserved {
            return Ok(candidate);
        }
    }
    Err(format!("空きコピー名を確保できませんでした: {}", name))
}

fn remove_reservation(path: &Path) {
    let is_dir = path.symlink_metadata().map(|m| m.is_dir()).unwrap_or(false);
    let _ = if is_dir {
        fs::remove_dir_all(path)
    } else {
        fs::remove_file(path)
    };
}

/// ファイル名を (stem, ext) に分割します。ext は `.` を含む（拡張子なしなら空文字）。
/// 先頭が `.` のドットファイルは拡張子なし扱い。
/// 複合拡張子（`.tar.gz` 等）は最後の `.` のみを拡張子とする（Windows エクスプローラー準拠）。
fn split_stem_ext(name: &str) -> (&str, &str) {
    match name.rfind('.') {
        Some(idx) if idx > 0 => (&name[..idx], &name[idx..]),
        _ => (name, ""),
    }
}

/// `src` を `target` へ再帰コピーします。`target` はコピー後のフルパス（宛先ディレクトリ + 名前）。
fn copy_recursive(src: &Path, target: &Path) -> Result<(), String> {
    // 自分自身の内部へのコピー（/a → /a/b）は無限再帰になるため弾く。
    if target.starts_with(src) {
        return Err(format!(
            "Cannot copy {} into itself ({})",
            src.display(),
            target.display()
        ));
    }

    let meta = src
        .symlink_metadata()
        .map_err(|e| format!("Failed to stat {}: {}", src.display(), e))?;

    if meta.file_type().is_symlink() {
        return copy_symlink(src, target);
    }
    if meta.is_dir() {
        return copy_dir_recursive(src, target);
    }
    fs::copy(src, target)
        .map(|_| ())
        .map_err(|e| format!("Failed to copy {}: {}", src.display(), e))
}

fn copy_symlink(src: &Path, target: &Path) -> Result<(), String> {
    let link = fs::read_link(src)
        .map_err(|e| format!("Failed to read symlink {}: {}", src.display(), e))?;
    // 既存リンクは置き換える（ファイル上書きの挙動に合わせる）。
    let _ = fs::remove_file(target);
    std::os::unix::fs::symlink(&link, target)
        .map_err(|e| format!("Failed to create symlink {}: {}", target.display(), e))
}

/// ディレクトリを再帰コピー。既存ディレクトリへはマージし、配下のエラーは収集して継続します。
fn copy_dir_recursive(src: &Path, target: &Path) -> Result<(), String> {
    fs::create_dir_all(target)
        .map_err(|e| format!("Failed to create dir {}: {}", target.display(), e))?;

    let entries =
        fs::read_dir(src).map_err(|e| format!("Failed to read dir {}: {}", src.display(), e))?;

    let errors: Vec<String> = entries
        .filter_map(|entry| {
            let path = entry.ok()?.path();
            let child_target = target.join(path.file_name()?);
            copy_recursive(&path, &child_target).err()
        })
        .collect();

    if errors.is_empty() {
        return Ok(());
    }
    Err(errors.join("\n"))
}

/// 指定された複数のファイルを宛先ディレクトリに移動します。
///
/// `std::fs::rename` を使用しており、同一ファイルシステム内の移動はアトミックに行われます。
#[tauri::command]
pub async fn move_files(sources: Vec<String>, dest: String) -> Result<(), String> {
    for src in sources.iter().filter(|s| std::path::Path::new(s).exists()) {
        let path = std::path::Path::new(src);
        let dest_path = std::path::Path::new(&dest).join(path.file_name().unwrap());
        fs::rename(src, dest_path).map_err(|e| format!("Failed to move {}: {}", src, e))?;
    }
    Ok(())
}

/// 指定されたファイルを削除、またはゴミ箱へ移動します。
///
/// `to_trash` が真の場合は `trash` クレートを使用して安全にゴミ箱へ送ります。
/// 偽の場合はファイルシステムから物理的に削除（復旧不能）します。
#[tauri::command]
pub async fn delete_files(paths: Vec<String>, to_trash: bool) -> Result<(), String> {
    if to_trash {
        return trash::delete_all(&paths).map_err(|e| format!("Failed to move to trash: {}", e));
    }
    for path in paths.iter().filter(|p| std::path::Path::new(p).exists()) {
        let meta = fs::metadata(path).map_err(|e| e.to_string())?;
        let res = if meta.is_dir() {
            fs::remove_dir_all(path)
        } else {
            fs::remove_file(path)
        };
        res.map_err(|e| format!("削除失敗 ({}): {}", path, e))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn rename_file(path: String, new_name: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    let new_path = p.parent().ok_or("No parent directory")?.join(new_name);
    fs::rename(&path, &new_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn batch_rename(paths: Vec<String>, new_names: Vec<String>) -> Result<(), String> {
    if paths.len() != new_names.len() {
        return Err("Path and name counts do not match".to_string());
    }
    for (path, new_name) in paths.into_iter().zip(new_names.into_iter()) {
        let new_path = std::path::Path::new(&path)
            .parent()
            .ok_or("No parent directory")?
            .join(new_name);
        fs::rename(&path, &new_path).map_err(|e| format!("Failed to rename {}: {}", path, e))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn check_exists(path: String) -> Result<bool, String> {
    Ok(std::path::Path::new(&path).exists())
}

/// `target` を指すシンボリックリンクを `link_path` に作成します。
///
/// 作成先に既に何か（壊れたリンク含む）が存在する場合はエラーにします（上書きしない）。
#[tauri::command]
pub async fn create_symlink(target: String, link_path: String) -> Result<(), String> {
    if Path::new(&link_path).symlink_metadata().is_ok() {
        return Err(format!("既にパスが存在します: {}", link_path));
    }
    std::os::unix::fs::symlink(&target, &link_path)
        .map_err(|e| format!("シンボリックリンク作成失敗 ({} -> {}): {}", link_path, target, e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recursively_copies_nested_dir_into_dest() {
        let tmp = tempfile::tempdir().unwrap();
        let src = tmp.path().join("src");
        let nested = src.join("sub");
        fs::create_dir_all(&nested).unwrap();
        fs::write(src.join("a.txt"), b"a").unwrap();
        fs::write(nested.join("b.txt"), b"b").unwrap();

        let dest = tmp.path().join("dest");
        fs::create_dir_all(&dest).unwrap();

        copy_entry(&src, &dest).unwrap();

        assert_eq!(fs::read(dest.join("src/a.txt")).unwrap(), b"a");
        assert_eq!(fs::read(dest.join("src/sub/b.txt")).unwrap(), b"b");
    }

    #[test]
    fn copies_symlink_as_link_not_target() {
        let tmp = tempfile::tempdir().unwrap();
        let src = tmp.path().join("src");
        fs::create_dir_all(&src).unwrap();
        fs::write(src.join("real.txt"), b"x").unwrap();
        std::os::unix::fs::symlink("real.txt", src.join("link.txt")).unwrap();

        let dest = tmp.path().join("dest");
        fs::create_dir_all(&dest).unwrap();

        copy_entry(&src, &dest).unwrap();

        let copied_link = dest.join("src/link.txt");
        assert!(copied_link.symlink_metadata().unwrap().file_type().is_symlink());
        assert_eq!(fs::read_link(copied_link).unwrap(), Path::new("real.txt"));
    }

    #[test]
    fn rejects_copy_into_self() {
        let tmp = tempfile::tempdir().unwrap();
        let src = tmp.path().join("a");
        fs::create_dir_all(&src).unwrap();

        // /a を /a 自身の配下へコピー → ガードで弾かれる
        let err = copy_entry(&src, &src).unwrap_err();
        assert!(err.contains("into itself"));
    }

    #[test]
    fn same_dir_copy_creates_unique_name_and_keeps_original() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path();
        let src = dir.join("file.txt");
        fs::write(&src, b"hello").unwrap();

        let target = copy_entry(&src, dir).unwrap();

        assert_eq!(target, dir.join("file - コピー.txt"));
        // 元ファイルは無傷
        assert_eq!(fs::read(&src).unwrap(), b"hello");
        assert_eq!(fs::read(&target).unwrap(), b"hello");
    }

    #[test]
    fn copy_files_keeps_partial_success_on_errors() {
        let tmp = tempfile::tempdir().unwrap();
        let dir_src = tmp.path().join("a");
        fs::create_dir_all(dir_src.join("sub")).unwrap();
        let file_src = tmp.path().join("f.txt");
        fs::write(&file_src, b"x").unwrap();

        // dest = /a/sub: /a 自身のコピーは into itself で失敗、f.txt は成功する
        let dest = dir_src.join("sub").to_string_lossy().into_owned();
        let sources = vec![
            dir_src.to_string_lossy().into_owned(),
            file_src.to_string_lossy().into_owned(),
        ];
        let result = copy_files_impl(&sources, &dest);

        assert_eq!(
            result.created_paths,
            vec![dir_src.join("sub/f.txt").to_string_lossy().into_owned()]
        );
        assert_eq!(result.errors.len(), 1);
        assert!(result.errors[0].contains("into itself"));
    }

    #[test]
    fn same_dir_copy_twice_increments_number() {
        let tmp = tempfile::tempdir().unwrap();
        let dir = tmp.path();
        let src = dir.join("file.txt");
        fs::write(&src, b"hello").unwrap();

        let first = copy_entry(&src, dir).unwrap();
        assert_eq!(first, dir.join("file - コピー.txt"));

        let second = copy_entry(&src, dir).unwrap();
        assert_eq!(second, dir.join("file - コピー (2).txt"));
        assert!(first.exists());
        assert!(second.exists());
    }
}
