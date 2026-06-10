//! ファイルの MD5 / SHA-1 / SHA-256 を一括計算するコマンド（プロパティダイアログ用）。
//!
//! 大容量ファイルに対応するため、BufReaderでチャンク読みしながら1パスで3種を計算する。

use std::fs::File;
use std::io::{BufReader, Read};

use md5::{Digest as _, Md5};
use sha1::Sha1;
use sha2::Sha256;

use super::types::FileHashes;

const CHUNK_SIZE: usize = 64 * 1024;

/// 指定ファイルの MD5 / SHA-1 / SHA-256 を1パスで計算して返します。
#[tauri::command]
pub async fn calculate_file_hash(path: String) -> Result<FileHashes, String> {
    tokio::task::spawn_blocking(move || hash_blocking(&path))
        .await
        .map_err(|e| format!("ハッシュ計算タスクエラー: {}", e))?
}

fn hash_blocking(path: &str) -> Result<FileHashes, String> {
    let file = File::open(path).map_err(|e| format!("ファイルを開けません ({}): {}", path, e))?;
    let mut reader = BufReader::new(file);

    let mut md5 = Md5::new();
    let mut sha1 = Sha1::new();
    let mut sha256 = Sha256::new();
    let mut buf = vec![0u8; CHUNK_SIZE];

    loop {
        let n = reader.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        md5.update(&buf[..n]);
        sha1.update(&buf[..n]);
        sha256.update(&buf[..n]);
    }

    Ok(FileHashes {
        md5: hex::encode(md5.finalize()),
        sha1: hex::encode(sha1.finalize()),
        sha256: hex::encode(sha256.finalize()),
    })
}

/// digest出力を小文字16進文字列へ変換する。
mod hex {
    pub fn encode(bytes: impl AsRef<[u8]>) -> String {
        bytes
            .as_ref()
            .iter()
            .map(|b| format!("{:02x}", b))
            .collect()
    }
}
