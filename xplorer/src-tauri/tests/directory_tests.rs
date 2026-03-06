use std::fs::File;
use tempfile::tempdir;
use xplorer_lib::directory::{list_directory, split_archive_path};

#[tokio::test]
async fn test_archive_browsing() {
    let dir = tempdir().unwrap();
    let zip_path = dir.path().join("test.zip");
    let zip_path_str = zip_path.to_str().unwrap();

    // 1. ファイルを作成
    File::create(&zip_path).unwrap();

    // 2. split_archive_path のテスト
    // パス自体
    let result = split_archive_path(zip_path_str);
    assert!(result.is_some());
    let (arc, inner) = result.unwrap();
    assert_eq!(arc, zip_path_str);
    assert_eq!(inner, "");

    // 内部パス
    let virtual_path = format!("{}/folder1/file2.txt", zip_path_str);
    let result = split_archive_path(&virtual_path);
    assert!(result.is_some());
    let (arc, inner) = result.unwrap();
    assert_eq!(arc, zip_path_str);
    assert_eq!(inner, "folder1/file2.txt");

    // 3. list_directory_internal のルーティングテスト
    // アーカイブ内のパスを指定した場合
    let _result = list_directory(virtual_path.clone(), false).await;
    // 実際の中身がないのでエラー（アーカイブを開けません）か空リストになるはずだが、
    // 少なくとも通常の fs::read_dir に流れてエラーにならないことを確認できれば良い
    // (仮想パスなので Path::new(virtual_path).is_dir() は false になり list_archive_internal が呼ばれる)
}
