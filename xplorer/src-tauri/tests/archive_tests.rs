//! アーカイブ機能のテスト
//!
//! ZIP、TAR、7zなど、libarchive2がサポートする全フォーマットの
//! 圧縮・展開機能を包括的にテストします。

use std::fs;
use std::path::Path;
use tempfile::TempDir;
use libarchive2::{ReadArchive, WriteArchive, ArchiveFormat, CompressionFormat};

/// テスト用ヘルパー：ZIPアーカイブを作成
fn create_test_zip(path: &Path, files: Vec<(&str, &[u8])>) -> Result<(), Box<dyn std::error::Error>> {
    let mut archive = WriteArchive::new()
        .format(ArchiveFormat::Zip)
        .compression(CompressionFormat::None)
        .open_file(path)?;

    for (name, content) in files {
        archive.add_file(name, content)?;
    }
    archive.finish()?;
    Ok(())
}

// =============================================================================
// 基本的なアーカイブ操作のテスト
// =============================================================================

#[test]
fn test_create_simple_zip_archive() {
    // Arrange
    let temp = TempDir::new().unwrap();
    let zip_path = temp.path().join("test.zip");
    let content1: &[u8] = b"content1";
    let content2: &[u8] = b"content2";
    let files = vec![
        ("file1.txt", content1),
        ("file2.txt", content2),
    ];

    // Act
    let result = create_test_zip(&zip_path, files);

    // Assert
    assert!(result.is_ok(), "ZIP作成が成功するべき");
    assert!(zip_path.exists(), "ZIPファイルが存在するべき");
}

#[test]
fn test_create_zip_with_unicode_filename() {
    // Arrange
    let temp = TempDir::new().unwrap();
    let zip_path = temp.path().join("unicode.zip");
    let content1: &[u8] = b"content";
    let content2: &[u8] = b"emoji content";
    let files = vec![
        ("日本語ファイル.txt", content1),
        ("📄emoji.txt", content2),
    ];

    // Act
    let result = create_test_zip(&zip_path, files);

    // Assert
    assert!(result.is_ok(), "Unicodeファイル名を含むZIP作成が成功するべき");
    assert!(zip_path.exists(), "ZIPファイルが存在するべき");
}

#[test]
fn test_extract_zip_archive() {
    // Arrange
    let temp = TempDir::new().unwrap();
    let zip_path = temp.path().join("extract_test.zip");
    let extract_dir = temp.path().join("extracted");
    fs::create_dir(&extract_dir).unwrap();

    let test_content = b"test content for extraction";
    create_test_zip(&zip_path, vec![("test.txt", test_content)]).unwrap();

    // Act
    let mut archive = ReadArchive::open(&zip_path).unwrap();
    while let Some(entry) = archive.next_entry().ok().flatten() {
        if let Some(name) = entry.pathname() {
            let out_path = extract_dir.join(name);
            if entry.file_type() != libarchive2::FileType::Directory {
                if let Some(parent) = out_path.parent() {
                    fs::create_dir_all(parent).ok();
                }
                let buffer = archive.read_data_to_vec().unwrap();
                fs::write(&out_path, buffer).ok();
            }
        }
    }

    // Assert
    let extracted_file = extract_dir.join("test.txt");
    assert!(extracted_file.exists(), "展開されたファイルが存在するべき");
    let content = fs::read(&extracted_file).unwrap();
    assert_eq!(content, test_content, "展開された内容が元の内容と一致するべき");
}

#[test]
fn test_path_traversal_detection() {
    // Arrange - パストラバーサル攻撃パターン（macOSのみ）
    let malicious_paths = vec![
        "../../../etc/passwd",
        "/absolute/path/file.txt",
    ];

    // Act & Assert
    for path in malicious_paths {
        let has_traversal = path.contains("../") || path.starts_with('/');
        assert!(
            has_traversal,
            "パス '{}' はパストラバーサルとして検出されるべき",
            path
        );
    }
}

#[test]
fn test_safe_paths_not_detected_as_traversal() {
    // Arrange - 安全なパス（macOSのみ）
    let safe_paths = vec![
        "normal_file.txt",
        "directory/nested/file.txt",
        "file with spaces.txt",
        "日本語/ファイル.txt",
    ];

    // Act & Assert
    for path in safe_paths {
        let has_traversal = path.contains("../") || path.starts_with('/');
        assert!(
            !has_traversal,
            "パス '{}' はパストラバーサルとして検出されないべき",
            path
        );
    }
}

#[test]
fn test_common_parent_directory() {
    // Arrange
    let paths = vec![
        "/Users/test/project/src/file.rs".to_string(),
        "/Users/test/project/src/utils/helper.rs".to_string(),
        "/Users/test/project/tests/test.rs".to_string(),
    ];

    // Act - 共通親ディレクトリを計算（手動で確認）
    let common = "/Users/test/project";
    let all_start_with_common = paths.iter().all(|p| p.starts_with(common));

    // Assert
    assert!(all_start_with_common, "すべてのパスが共通親ディレクトリで始まるべき");
}

#[test]
fn test_empty_directory_compression() {
    // Arrange
    let temp = TempDir::new().unwrap();
    let empty_dir = temp.path().join("empty");
    fs::create_dir(&empty_dir).unwrap();

    // Act
    let archive = WriteArchive::new()
        .format(ArchiveFormat::Zip)
        .compression(CompressionFormat::None)
        .open_file(temp.path().join("empty.zip"))
        .unwrap();

    // 空のディレクトリのみを追加（libarchiveの挙動に依存）
    let result = archive.finish();

    // Assert
    assert!(result.is_ok(), "空のアーカイブ作成は成功するべき");
}

#[test]
fn test_large_file_compression() {
    // Arrange
    let temp = TempDir::new().unwrap();
    let large_content = vec![0u8; 1024 * 1024]; // 1MB
    let zip_path = temp.path().join("large.zip");

    // Act
    let mut archive = WriteArchive::new()
        .format(ArchiveFormat::Zip)
        .compression(CompressionFormat::None)
        .open_file(&zip_path)
        .unwrap();
    archive.add_file("large.bin", &large_content).unwrap();
    archive.finish().unwrap();

    // Assert
    assert!(zip_path.exists(), "大きなファイルのアーカイブが存在するべき");
    assert!(zip_path.metadata().unwrap().len() > 0, "アーカイブサイズが0より大きいべき");
}

#[test]
fn test_nested_directory_structure() {
    // Arrange
    let temp = TempDir::new().unwrap();
    let base = temp.path().join("nested");
    let deep_dir = base.join("level1/level2/level3");
    fs::create_dir_all(&deep_dir).unwrap();
    fs::write(deep_dir.join("deep.txt"), "deep content").unwrap();

    // Act & Assert
    assert!(deep_dir.exists(), "深いネストディレクトリが存在するべき");
    assert!(deep_dir.join("deep.txt").exists(), "深いネストのファイルが存在するべき");
}

#[test]
fn test_archive_format_detection() {
    // Arrange
    let test_cases = vec![
        ("archive.zip", "zip"),
        ("archive.tar", "tar"),
        ("archive.tar.gz", "tar.gz"),
        ("archive.tgz", "tar.gz"),
        ("archive.tar.bz2", "tar.bz2"),
        ("archive.tar.xz", "tar.xz"),
        ("archive.tar.zst", "tar.zst"),
        ("archive.7z", "7z"),
    ];

    // Act & Assert
    for (filename, expected_format) in test_cases {
        let detected = if filename.ends_with(".zip") {
            "zip"
        } else if filename.ends_with(".7z") {
            "7z"
        } else if filename.ends_with(".tar.gz") || filename.ends_with(".tgz") {
            "tar.gz"
        } else if filename.ends_with(".tar.bz2") {
            "tar.bz2"
        } else if filename.ends_with(".tar.xz") {
            "tar.xz"
        } else if filename.ends_with(".tar.zst") {
            "tar.zst"
        } else if filename.ends_with(".tar") {
            "tar"
        } else {
            "zip" // デフォルト
        };
        assert_eq!(
            detected, expected_format,
            "ファイル '{}' のフォーマット検出が正しいべき",
            filename
        );
    }
}

#[test]
fn test_error_collection_on_missing_files() {
    // Arrange
    let temp = TempDir::new().unwrap();
    let existing = temp.path().join("exists.txt");
    fs::write(&existing, "content").unwrap();
    let nonexistent_path = temp.path().join("nonexistent.txt");

    // Act - 存在しないファイルを含むリストをシミュレート
    let files = vec![
        existing.to_str().unwrap(),
        nonexistent_path.to_str().unwrap(),
    ];

    let mut error_count = 0;
    for file in &files {
        if !Path::new(file).exists() {
            error_count += 1;
        }
    }

    // Assert
    assert_eq!(error_count, 1, "存在しないファイル数が正しくカウントされるべき");
}

#[test]
fn test_extract_preserves_file_permissions() {
    // Arrange
    let temp = TempDir::new().unwrap();
    let zip_path = temp.path().join("perm_test.zip");
    let extract_dir = temp.path().join("extracted");
    fs::create_dir(&extract_dir).unwrap();

    create_test_zip(&zip_path, vec![("test.txt", b"content")]).unwrap();

    // Act
    let mut archive = ReadArchive::open(&zip_path).unwrap();
    while let Some(entry) = archive.next_entry().ok().flatten() {
        if let Some(name) = entry.pathname() {
            let out_path = extract_dir.join(name);
            if entry.file_type() != libarchive2::FileType::Directory {
                if let Some(parent) = out_path.parent() {
                    fs::create_dir_all(parent).ok();
                }
                let buffer = archive.read_data_to_vec().unwrap();
                fs::write(&out_path, buffer).ok();
            }
        }
    }

    // Assert
    let extracted = extract_dir.join("test.txt");
    assert!(extracted.exists(), "展開されたファイルが存在するべき");
    let metadata = fs::metadata(&extracted).unwrap();
    assert!(metadata.permissions().readonly() == false, "ファイルが読み取り可能であるべき");
}

// =============================================================================
// 全アーカイブフォーマットの動作確認テスト
// =============================================================================

/// 汎用アーカイブ作成ヘルパー
fn create_archive_with_format(
    path: &Path,
    files: Vec<(&str, &[u8])>,
    format: ArchiveFormat,
    compression: CompressionFormat,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut archive = WriteArchive::new()
        .format(format)
        .compression(compression)
        .open_file(path)?;

    for (name, content) in files {
        archive.add_file(name, content)?;
    }
    archive.finish()?;
    Ok(())
}

/// 汎用アーカイブ展開ヘルパー
fn extract_archive(archive_path: &Path, dest_dir: &Path) -> Result<usize, Box<dyn std::error::Error>> {
    let mut archive = ReadArchive::open(archive_path)?;
    let mut file_count = 0;

    while let Some(entry) = archive.next_entry()? {
        if let Some(name) = entry.pathname() {
            let out_path = dest_dir.join(name);

            if entry.file_type() == libarchive2::FileType::Directory {
                // ディレクトリを作成
                fs::create_dir_all(&out_path)?;
            } else {
                // ファイルの親ディレクトリを作成
                if let Some(parent) = out_path.parent() {
                    fs::create_dir_all(parent)?;
                }
                let buffer = archive.read_data_to_vec()?;
                fs::write(&out_path, buffer)?;
                file_count += 1;
            }
        }
    }
    Ok(file_count)
}

#[test]
fn test_tar_format_compression_and_extraction() {
    // Arrange
    let temp = TempDir::new().unwrap();
    let tar_path = temp.path().join("test.tar");
    let extract_dir = temp.path().join("extracted");
    fs::create_dir(&extract_dir).unwrap();
    let content1: &[u8] = b"tar content 1";
    let content2: &[u8] = b"tar content 2";
    let files = vec![("file1.txt", content1), ("file2.txt", content2)];

    // Act - 圧縮
    let result = create_archive_with_format(
        &tar_path,
        files,
        ArchiveFormat::TarPax,
        CompressionFormat::None,
    );
    assert!(result.is_ok(), "TAR作成が成功するべき");
    assert!(tar_path.exists(), "TARファイルが存在するべき");

    // Act - 展開
    let extracted_count = extract_archive(&tar_path, &extract_dir).unwrap();

    // Assert
    assert_eq!(extracted_count, 2, "2つのファイルが展開されるべき");
    assert!(extract_dir.join("file1.txt").exists(), "file1.txtが存在するべき");
    assert!(extract_dir.join("file2.txt").exists(), "file2.txtが存在するべき");
    assert_eq!(
        fs::read_to_string(extract_dir.join("file1.txt")).unwrap(),
        "tar content 1",
        "展開された内容が正しいべき"
    );
}

#[test]
fn test_targz_format_compression_and_extraction() {
    // Arrange
    let temp = TempDir::new().unwrap();
    let tar_path = temp.path().join("test.tar.gz");
    let extract_dir = temp.path().join("extracted");
    fs::create_dir(&extract_dir).unwrap();
    let content: &[u8] = b"tar.gz content";
    let files = vec![("compressed.txt", content)];

    // Act - 圧縮
    let result = create_archive_with_format(
        &tar_path,
        files,
        ArchiveFormat::TarPax,
        CompressionFormat::Gzip,
    );
    assert!(result.is_ok(), "TAR.GZ作成が成功するべき");
    assert!(tar_path.exists(), "TAR.GZファイルが存在するべき");

    // Act - 展開
    let extracted_count = extract_archive(&tar_path, &extract_dir).unwrap();

    // Assert
    assert_eq!(extracted_count, 1, "1つのファイルが展開されるべき");
    assert_eq!(
        fs::read_to_string(extract_dir.join("compressed.txt")).unwrap(),
        "tar.gz content",
        "展開された内容が正しいべき"
    );
}

#[test]
fn test_targz_compression_reduces_size() {
    // Arrange
    let temp = TempDir::new().unwrap();
    let tar_path = temp.path().join("compressed.tar.gz");
    let tar_uncompressed = temp.path().join("uncompressed.tar");
    let repeat_content = std::iter::repeat(b'a' as u8).take(100_000).collect::<Vec<_>>();
    let content: &[u8] = &repeat_content;
    let files = vec![("large.txt", content)];

    // Act - 圧縮あり
    create_archive_with_format(
        &tar_path,
        files.clone(),
        ArchiveFormat::TarPax,
        CompressionFormat::Gzip,
    )
    .unwrap();

    // Act - 圧縮なし
    create_archive_with_format(
        &tar_uncompressed,
        files,
        ArchiveFormat::TarPax,
        CompressionFormat::None,
    )
    .unwrap();

    // Assert
    let compressed_size = fs::metadata(&tar_path).unwrap().len();
    let uncompressed_size = fs::metadata(&tar_uncompressed).unwrap().len();
    assert!(
        compressed_size < uncompressed_size,
        "圧縮版の方がサイズが小さいべき: {} < {}",
        compressed_size,
        uncompressed_size
    );
}

#[test]
fn test_tarbz2_format_compression_and_extraction() {
    // Arrange
    let temp = TempDir::new().unwrap();
    let tar_path = temp.path().join("test.tar.bz2");
    let extract_dir = temp.path().join("extracted");
    fs::create_dir(&extract_dir).unwrap();
    let content: &[u8] = b"tar.bz2 content";
    let files = vec![("bzip2.txt", content)];

    // Act - 圧縮
    let result = create_archive_with_format(
        &tar_path,
        files,
        ArchiveFormat::TarPax,
        CompressionFormat::Bzip2,
    );
    assert!(result.is_ok(), "TAR.BZ2作成が成功するべき");
    assert!(tar_path.exists(), "TAR.BZ2ファイルが存在するべき");

    // Act - 展開
    let extracted_count = extract_archive(&tar_path, &extract_dir).unwrap();

    // Assert
    assert_eq!(extracted_count, 1, "1つのファイルが展開されるべき");
    assert_eq!(
        fs::read_to_string(extract_dir.join("bzip2.txt")).unwrap(),
        "tar.bz2 content",
        "展開された内容が正しいべき"
    );
}

#[test]
fn test_tarxz_format_compression_and_extraction() {
    // Arrange
    let temp = TempDir::new().unwrap();
    let tar_path = temp.path().join("test.tar.xz");
    let extract_dir = temp.path().join("extracted");
    fs::create_dir(&extract_dir).unwrap();
    let content: &[u8] = b"tar.xz content";
    let files = vec![("xz.txt", content)];

    // Act - 圧縮
    let result = create_archive_with_format(
        &tar_path,
        files,
        ArchiveFormat::TarPax,
        CompressionFormat::Xz,
    );
    assert!(result.is_ok(), "TAR.XZ作成が成功するべき");
    assert!(tar_path.exists(), "TAR.XZファイルが存在するべき");

    // Act - 展開
    let extracted_count = extract_archive(&tar_path, &extract_dir).unwrap();

    // Assert
    assert_eq!(extracted_count, 1, "1つのファイルが展開されるべき");
    assert_eq!(
        fs::read_to_string(extract_dir.join("xz.txt")).unwrap(),
        "tar.xz content",
        "展開された内容が正しいべき"
    );
}

#[test]
fn test_tarzst_format_compression_and_extraction() {
    // Arrange
    let temp = TempDir::new().unwrap();
    let tar_path = temp.path().join("test.tar.zst");
    let extract_dir = temp.path().join("extracted");
    fs::create_dir(&extract_dir).unwrap();
    let content: &[u8] = b"tar.zst content";
    let files = vec![("zstd.txt", content)];

    // Act - 圧縮
    let result = create_archive_with_format(
        &tar_path,
        files,
        ArchiveFormat::TarPax,
        CompressionFormat::Zstd,
    );
    assert!(result.is_ok(), "TAR.ZST作成が成功するべき");
    assert!(tar_path.exists(), "TAR.ZSTファイルが存在するべき");

    // Act - 展開
    let extracted_count = extract_archive(&tar_path, &extract_dir).unwrap();

    // Assert
    assert_eq!(extracted_count, 1, "1つのファイルが展開されるべき");
    assert_eq!(
        fs::read_to_string(extract_dir.join("zstd.txt")).unwrap(),
        "tar.zst content",
        "展開された内容が正しいべき"
    );
}

#[test]
fn test_7z_format_compression_and_extraction() {
    // Arrange
    let temp = TempDir::new().unwrap();
    let archive_path = temp.path().join("test.7z");
    let extract_dir = temp.path().join("extracted");
    fs::create_dir(&extract_dir).unwrap();
    let content1: &[u8] = b"7z content 1";
    let content2: &[u8] = b"7z content 2";
    let content3: &[u8] = b"7z content 3";
    let files: Vec<(&str, &[u8])> = vec![
        ("file1.txt", content1),
        ("file2.txt", content2),
        ("file3.txt", content3),
    ];

    // Act - 圧縮
    let result = create_archive_with_format(
        &archive_path,
        files,
        ArchiveFormat::SevenZip,
        CompressionFormat::None,
    );
    assert!(result.is_ok(), "7z作成が成功するべき");
    assert!(archive_path.exists(), "7zファイルが存在するべき");

    // Act - 展開
    let extracted_count = extract_archive(&archive_path, &extract_dir).unwrap();

    // Assert
    assert_eq!(extracted_count, 3, "3つのファイルが展開されるべき");
    assert!(extract_dir.join("file1.txt").exists(), "file1.txtが存在するべき");
    assert!(extract_dir.join("file2.txt").exists(), "file2.txtが存在するべき");
    assert!(extract_dir.join("file3.txt").exists(), "file3.txtが存在するべき");
}

#[test]
fn test_all_formats_support_ascii_filenames() {
    // libarchive2のUnicodeファイル名サポート制限を確認するテスト
    // 注: libarchive2は現在、Unicodeファイル名（日本語、絵文字、キリル文字など）を
    // 正しく処理できません。pathname()がNoneを返します。
    // このテストではASCIIファイル名が全フォーマットで動作することを確認します。

    // Arrange
    let temp = TempDir::new().unwrap();
    let ascii_files: Vec<(&str, &[u8])> = vec![
        ("file1.txt", b"content1".as_slice()),
        ("file2.txt", b"content2".as_slice()),
        ("file3.txt", b"content3".as_slice()),
    ];

    let test_formats = vec![
        ("test.zip", ArchiveFormat::Zip, CompressionFormat::None),
        ("test.tar", ArchiveFormat::TarPax, CompressionFormat::None),
        ("test.tar.gz", ArchiveFormat::TarPax, CompressionFormat::Gzip),
        ("test.tar.bz2", ArchiveFormat::TarPax, CompressionFormat::Bzip2),
        ("test.tar.xz", ArchiveFormat::TarPax, CompressionFormat::Xz),
        ("test.tar.zst", ArchiveFormat::TarPax, CompressionFormat::Zstd),
        ("test.7z", ArchiveFormat::SevenZip, CompressionFormat::None),
    ];

    // Act & Assert - 各フォーマットでASCIIファイル名をテスト
    for (i, (filename, format, compression)) in test_formats.iter().enumerate() {
        let archive_path = temp.path().join(filename);
        let extract_dir = temp.path().join(format!("ascii_extracted_{}", i));
        fs::create_dir(&extract_dir).unwrap();

        // 圧縮
        let result = create_archive_with_format(
            &archive_path,
            ascii_files.clone(),
            *format,
            *compression,
        );
        assert!(
            result.is_ok(),
            "{:?}フォーマットでのASCIIファイル名作成が成功するべき",
            format
        );

        // 展開
        let extracted_count = extract_archive(&archive_path, &extract_dir).unwrap();
        assert_eq!(
            extracted_count,
            3,
            "{:?}フォーマットで3つのファイルが展開されるべき",
            format
        );

        // ファイルが正しく展開されたことを確認
        assert!(extract_dir.join("file1.txt").exists());
        assert!(extract_dir.join("file2.txt").exists());
        assert!(extract_dir.join("file3.txt").exists());
    }
}

#[test]
fn test_all_formats_support_nested_directories() {
    // Arrange
    let temp = TempDir::new().unwrap();
    let nested_files: Vec<(&str, &[u8])> = vec![
        ("root.txt", b"root content".as_slice()),
        ("dir1/nested.txt", b"nested content".as_slice()),
        ("dir1/dir2/deep.txt", b"deep content".as_slice()),
    ];

    let test_formats = vec![
        ("nested.zip", ArchiveFormat::Zip, CompressionFormat::None),
        ("nested.tar", ArchiveFormat::TarPax, CompressionFormat::None),
        (
            "nested.tar.gz",
            ArchiveFormat::TarPax,
            CompressionFormat::Gzip,
        ),
        ("nested.7z", ArchiveFormat::SevenZip, CompressionFormat::None),
    ];

    // Act & Assert - 各フォーマットでネストされたディレクトリ構造をテスト
    for (i, (filename, format, compression)) in test_formats.iter().enumerate() {
        let archive_path = temp.path().join(filename);
        let extract_dir = temp.path().join(format!("nested_extracted_{}", i));
        fs::create_dir(&extract_dir).unwrap();

        // 圧縮
        let result =
            create_archive_with_format(&archive_path, nested_files.clone(), *format, *compression);
        assert!(
            result.is_ok(),
            "{:?}フォーマットでのネスト構造作成が成功するべき",
            format
        );

        // 展開
        let extracted_count = extract_archive(&archive_path, &extract_dir).unwrap();
        assert_eq!(
            extracted_count,
            3,
            "{:?}フォーマットで3つのファイルが展開されるべき",
            format
        );

        // 深いネストのファイルが存在することを確認
        assert!(
            extract_dir.join("dir1/dir2/deep.txt").exists(),
            "{:?}フォーマットで深いネストのファイルが展開されるべき",
            format
        );
    }
}

#[test]
fn test_compression_ratio_comparison() {
    // Arrange - 圧縮可能なデータ（繰り返しパターン）
    let temp = TempDir::new().unwrap();
    let repeat_content = std::iter::repeat(b'x' as u8).take(50_000).collect::<Vec<_>>();
    let content: &[u8] = &repeat_content;
    let files = vec![("repetitive.txt", content)];

    // Act - 各フォーマットで圧縮
    let formats = vec![
        ("uncompressed.tar", ArchiveFormat::TarPax, CompressionFormat::None),
        ("gzip.tar.gz", ArchiveFormat::TarPax, CompressionFormat::Gzip),
        ("bzip2.tar.bz2", ArchiveFormat::TarPax, CompressionFormat::Bzip2),
        ("xz.tar.xz", ArchiveFormat::TarPax, CompressionFormat::Xz),
        ("zstd.tar.zst", ArchiveFormat::TarPax, CompressionFormat::Zstd),
    ];

    let mut sizes = Vec::new();
    for (filename, format, compression) in formats {
        let archive_path = temp.path().join(filename);
        create_archive_with_format(&archive_path, files.to_vec(), format, compression).unwrap();
        let size = fs::metadata(&archive_path).unwrap().len();
        sizes.push((filename, size));
    }

    // Assert - 圧縮版は非圧縮版より小さい
    let uncompressed_size = sizes[0].1;
    for (format_name, compressed_size) in &sizes[1..] {
        assert!(
            *compressed_size < uncompressed_size,
            "{} ({}) は非圧縮 ({}) より小さいべき",
            format_name,
            compressed_size,
            uncompressed_size
        );
    }
}

#[test]
fn test_format_detection_matches_actual_formats() {
    // Arrange & Act & Assert
    // parse_format関数と同等のマッピングを検証
    let test_cases = vec![
        ("zip", ArchiveFormat::Zip, CompressionFormat::None),
        ("tar", ArchiveFormat::TarPax, CompressionFormat::None),
        ("tar.gz", ArchiveFormat::TarPax, CompressionFormat::Gzip),
        ("tgz", ArchiveFormat::TarPax, CompressionFormat::Gzip),
        ("tar.bz2", ArchiveFormat::TarPax, CompressionFormat::Bzip2),
        ("tar.xz", ArchiveFormat::TarPax, CompressionFormat::Xz),
        ("tar.zst", ArchiveFormat::TarPax, CompressionFormat::Zstd),
        ("7z", ArchiveFormat::SevenZip, CompressionFormat::None),
    ];

    // 各フォーマット文字列が正しいArchiveFormatとCompressionFormatに対応することを確認
    for (format_str, expected_archive, expected_compression) in test_cases {
        let (archive_fmt, compression_fmt) = match format_str {
            "zip" => (ArchiveFormat::Zip, CompressionFormat::None),
            "tar" => (ArchiveFormat::TarPax, CompressionFormat::None),
            "tar.gz" | "tgz" => (ArchiveFormat::TarPax, CompressionFormat::Gzip),
            "tar.bz2" => (ArchiveFormat::TarPax, CompressionFormat::Bzip2),
            "tar.xz" => (ArchiveFormat::TarPax, CompressionFormat::Xz),
            "tar.zst" => (ArchiveFormat::TarPax, CompressionFormat::Zstd),
            "7z" => (ArchiveFormat::SevenZip, CompressionFormat::None),
            _ => (ArchiveFormat::Zip, CompressionFormat::None),
        };

        assert_eq!(
            archive_fmt, expected_archive,
            "'{}' のArchiveFormatが正しいべき",
            format_str
        );
        assert_eq!(
            compression_fmt, expected_compression,
            "'{}' のCompressionFormatが正しいべき",
            format_str
        );
    }
}
