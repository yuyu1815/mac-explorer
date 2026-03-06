use std::fs::File;
use std::io::{BufReader, BufWriter, Read, Write};
use std::path::Path;

use walkdir::WalkDir;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

use super::types::{CompressionProgress, CompressionResult, ExtractionProgress, ExtractionResult};

/// ファイル/フォルダをZIPに圧縮
#[tauri::command]
pub async fn compress_to_zip(
    sources: Vec<String>,
    dest_zip_path: String,
    channel: tauri::ipc::Channel<CompressionProgress>,
) -> Result<CompressionResult, String> {
    let sources = sources.clone();
    let dest = dest_zip_path.clone();

    tokio::task::spawn_blocking(move || {
        let dest_path = Path::new(&dest);

        // 出力先の親ディレクトリが存在するか確認
        if let Some(parent) = dest_path.parent() {
            if !parent.exists() {
                return Err(format!("親ディレクトリが存在しません: {}", parent.display()));
            }
        }

        // 既存ファイルのチェック
        if dest_path.exists() {
            return Err(format!(
                "ファイルが既に存在します: {}",
                dest_path.display()
            ));
        }

        // 総ファイル数とサイズを計算
        let mut total_files = 0u32;
        let mut total_bytes = 0u64;
        let mut file_list: Vec<(String, u64)> = Vec::new();

        for src in &sources {
            let src_path = Path::new(src);
            if !src_path.exists() {
                continue;
            }

            if src_path.is_file() {
                if let Ok(metadata) = std::fs::metadata(src_path) {
                    total_files += 1;
                    total_bytes += metadata.len();
                    file_list.push((src.clone(), metadata.len()));
                }
            } else if src_path.is_dir() {
                for entry in WalkDir::new(src_path).into_iter().filter_map(|e| e.ok()) {
                    if entry.file_type().is_file() {
                        if let Ok(metadata) = entry.metadata() {
                            total_files += 1;
                            total_bytes += metadata.len();
                            file_list.push((entry.path().display().to_string(), metadata.len()));
                        }
                    }
                }
            }
        }

        if total_files == 0 {
            return Err("圧縮するファイルがありません".to_string());
        }

        // ZIPファイル作成
        let file = File::create(dest_path)
            .map_err(|e| format!("ZIPファイルを作成できません: {}", e))?;
        let mut zip = ZipWriter::new(BufWriter::new(file));
        let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

        let mut files_processed = 0u32;
        let mut bytes_processed = 0u64;
        let emit_interval = 50;

        for (file_path, _file_size) in file_list {
            let path = Path::new(&file_path);
            if !path.exists() || !path.is_file() {
                continue;
            }

            let file_name = path.file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown");

            // ZIP内のパスを計算（ベースディレクトリからの相対パス）
            let zip_path = if sources.len() == 1 {
                // 単一ソースの場合はファイル名のみ
                file_name.to_string()
            } else {
                // 複数ソースの場合は元のパスを維持
                file_path.clone()
            };

            // ファイルをZIPに追加
            match File::open(path) {
                Ok(mut input) => {
                    if let Err(e) = zip.start_file(&zip_path, options) {
                        eprintln!("ZIPエントリ開始エラー {}: {}", zip_path, e);
                        continue;
                    }

                    let mut buffer = Vec::new();
                    if let Err(e) = input.read_to_end(&mut buffer) {
                        eprintln!("ファイル読み込みエラー {}: {}", file_path, e);
                        continue;
                    }

                    if let Err(e) = zip.write_all(&buffer) {
                        eprintln!("ZIP書き込みエラー {}: {}", zip_path, e);
                        continue;
                    }

                    bytes_processed += buffer.len() as u64;
                }
                Err(e) => {
                    eprintln!("ファイルオープンエラー {}: {}", file_path, e);
                    continue;
                }
            }

            files_processed += 1;

            // 進捗報告
            if files_processed % emit_interval == 0 || files_processed == total_files {
                let _ = channel.send(CompressionProgress {
                    current_file: file_name.to_string(),
                    files_processed,
                    total_files,
                    bytes_processed,
                    total_bytes,
                    complete: false,
                });
            }
        }

        zip.finish()
            .map_err(|e| format!("ZIPの完了に失敗: {}", e))?;

        // 圧縮後のサイズを取得
        let compressed_size = std::fs::metadata(dest_path)
            .map(|m| m.len())
            .unwrap_or(0);

        // 完了通知
        let _ = channel.send(CompressionProgress {
            current_file: String::new(),
            files_processed,
            total_files,
            bytes_processed,
            total_bytes,
            complete: true,
        });

        Ok(CompressionResult {
            zip_path: dest_zip_path,
            files_count: files_processed,
            original_size: bytes_processed,
            compressed_size,
        })
    })
    .await
    .map_err(|e| format!("圧縮タスクエラー: {}", e))?
}

/// ZIPファイルを解凍
#[tauri::command]
pub async fn extract_zip(
    zip_path: String,
    dest_dir: String,
    channel: tauri::ipc::Channel<ExtractionProgress>,
) -> Result<ExtractionResult, String> {
    let src = zip_path.clone();
    let dest = dest_dir.clone();

    tokio::task::spawn_blocking(move || {
        let src_path = Path::new(&src);
        let dest_path = Path::new(&dest);

        // ZIPファイルの存在確認
        if !src_path.exists() {
            return Err(format!("ZIPファイルが存在しません: {}", src_path.display()));
        }

        if !src_path.extension().map(|e| e == "zip").unwrap_or(false) {
            return Err(format!("ZIPファイルではありません: {}", src_path.display()));
        }

        // 解凍先ディレクトリの作成
        if !dest_path.exists() {
            std::fs::create_dir_all(dest_path)
                .map_err(|e| format!("解凍先ディレクトリを作成できません: {}", e))?;
        }

        // ZIPファイルを開く
        let file = File::open(src_path)
            .map_err(|e| format!("ZIPファイルを開けません: {}", e))?;
        let reader = BufReader::new(file);

        let mut archive = zip::ZipArchive::new(reader)
            .map_err(|e| format!("ZIPアーカイブの読み込みに失敗: {}", e))?;

        let total_files = archive.len() as u32;

        if total_files == 0 {
            return Err("ZIPファイルが空です".to_string());
        }

        let mut files_processed = 0u32;
        let mut bytes_processed = 0u64;
        let emit_interval = 50;

        for i in 0..archive.len() {
            let mut file = archive.by_index(i)
                .map_err(|e| format!("ZIPエントリの取得に失敗 (index {}): {}", i, e))?;

            let out_path = dest_path.join(file.name());

            // ディレクトリの場合
            if file.name().ends_with('/') {
                if let Err(e) = std::fs::create_dir_all(&out_path) {
                    eprintln!("ディレクトリ作成エラー {}: {}", out_path.display(), e);
                }
                files_processed += 1;
                continue;
            }

            // 親ディレクトリの作成
            if let Some(parent) = out_path.parent() {
                if let Err(e) = std::fs::create_dir_all(parent) {
                    eprintln!("親ディレクトリ作成エラー {}: {}", parent.display(), e);
                    continue;
                }
            }

            // ファイルの解凍
            let mut buffer = Vec::new();
            if let Err(e) = file.read_to_end(&mut buffer) {
                eprintln!("ファイル読み込みエラー {}: {}", file.name(), e);
                continue;
            }

            match File::create(&out_path) {
                Ok(mut output) => {
                    if let Err(e) = output.write_all(&buffer) {
                        eprintln!("ファイル書き込みエラー {}: {}", out_path.display(), e);
                        continue;
                    }
                }
                Err(e) => {
                    eprintln!("ファイル作成エラー {}: {}", out_path.display(), e);
                    continue;
                }
            }

            bytes_processed += buffer.len() as u64;
            files_processed += 1;

            // 進捗報告
            if files_processed % emit_interval == 0 || files_processed == total_files {
                let _ = channel.send(ExtractionProgress {
                    current_file: file.name().to_string(),
                    files_processed,
                    total_files,
                    bytes_processed,
                    total_bytes: 0, // ZIP内の総サイズは事前計算が難しいため0
                    complete: false,
                });
            }
        }

        // 完了通知
        let _ = channel.send(ExtractionProgress {
            current_file: String::new(),
            files_processed,
            total_files,
            bytes_processed,
            total_bytes: 0,
            complete: true,
        });

        Ok(ExtractionResult {
            extracted_count: files_processed,
            extracted_size: bytes_processed,
            destination: dest_dir,
        })
    })
    .await
    .map_err(|e| format!("解凍タスクエラー: {}", e))?
}
