use std::fs::{self, File};

mod test_utils;
use test_utils::ProjectTempDir;

use xplorer_lib::directory::{list_directory, list_files_sorted, complete_path, split_archive_path};

// =============================================================================
// split_archive_path のテスト
// =============================================================================

mod split_archive_path_tests {
    use super::*;

    #[test]
    fn test_split_archive_path_root() {
        let temp = ProjectTempDir::new("split_archive_root");
        let zip_path = temp.path().join("test.zip");
        File::create(&zip_path).unwrap();
        let zip_path_str = zip_path.to_str().unwrap();

        let result = split_archive_path(zip_path_str);
        assert!(result.is_some());
        let (arc, inner) = result.unwrap();
        assert_eq!(arc, zip_path_str);
        assert_eq!(inner, "");
    }

    #[test]
    fn test_split_archive_path_with_inner() {
        let temp = ProjectTempDir::new("split_archive_inner");
        let zip_path = temp.path().join("test.zip");
        File::create(&zip_path).unwrap();
        let zip_path_str = zip_path.to_str().unwrap();

        let virtual_path = format!("{}/folder1/file.txt", zip_path_str);
        let result = split_archive_path(&virtual_path);
        assert!(result.is_some());
        let (arc, inner) = result.unwrap();
        assert_eq!(arc, zip_path_str);
        assert_eq!(inner, "folder1/file.txt");
    }

    #[test]
    fn test_split_archive_path_nested_inner() {
        let temp = ProjectTempDir::new("split_archive_nested");
        let zip_path = temp.path().join("archive.7z");
        File::create(&zip_path).unwrap();
        let zip_path_str = zip_path.to_str().unwrap();

        let virtual_path = format!("{}/a/b/c/d/file.txt", zip_path_str);
        let result = split_archive_path(&virtual_path);
        assert!(result.is_some());
        let (arc, inner) = result.unwrap();
        assert_eq!(arc, zip_path_str);
        assert_eq!(inner, "a/b/c/d/file.txt");
    }

    #[test]
    fn test_split_archive_path_non_archive() {
        let temp = ProjectTempDir::new("split_non_archive");
        let txt_path = temp.path().join("test.txt");
        File::create(&txt_path).unwrap();

        // .txt is not an archive, so should return None
        let result = split_archive_path(txt_path.to_str().unwrap());
        assert!(result.is_none());
    }

    #[test]
    fn test_split_archive_path_various_formats() {
        let temp = ProjectTempDir::new("split_formats");
        let formats = ["test.zip", "test.7z", "test.tar", "test.tar.gz", "test.tar.bz2"];

        for fmt in &formats {
            let archive_path = temp.path().join(fmt);
            File::create(&archive_path).unwrap();
            let result = split_archive_path(archive_path.to_str().unwrap());
            assert!(result.is_some(), "{} should be recognized as archive", fmt);
        }
    }
}

// =============================================================================
// list_directory のテスト
// =============================================================================

mod list_directory_tests {
    use super::*;

    #[tokio::test]
    async fn test_list_directory_empty() {
        let temp = ProjectTempDir::new("list_dir_empty");
        let dir = temp.path().join("empty");
        fs::create_dir(&dir).unwrap();

        let result = list_directory(dir.to_string_lossy().to_string(), false)
            .await
            .unwrap();

        assert!(result.is_empty());
    }

    #[tokio::test]
    async fn test_list_directory_with_files() {
        let temp = ProjectTempDir::new("list_dir_files");
        fs::write(temp.path().join("file1.txt"), "content1").unwrap();
        fs::write(temp.path().join("file2.txt"), "content2").unwrap();

        let result = list_directory(temp.path().to_string_lossy().to_string(), false)
            .await
            .unwrap();

        assert_eq!(result.len(), 2);
    }

    #[tokio::test]
    async fn test_list_directory_with_directories() {
        let temp = ProjectTempDir::new("list_dir_dirs");
        fs::create_dir(temp.path().join("dir1")).unwrap();
        fs::create_dir(temp.path().join("dir2")).unwrap();

        let result = list_directory(temp.path().to_string_lossy().to_string(), false)
            .await
            .unwrap();

        assert_eq!(result.len(), 2);
        assert!(result.iter().all(|e| e.is_dir));
    }

    #[tokio::test]
    async fn test_list_directory_hidden_files() {
        let temp = ProjectTempDir::new("list_dir_hidden");
        fs::write(temp.path().join("visible.txt"), "content").unwrap();
        fs::write(temp.path().join(".hidden"), "hidden").unwrap();

        // Without hidden files
        let result = list_directory(temp.path().to_string_lossy().to_string(), false)
            .await
            .unwrap();
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].name, "visible.txt");

        // With hidden files
        let result = list_directory(temp.path().to_string_lossy().to_string(), true)
            .await
            .unwrap();
        assert_eq!(result.len(), 2);
    }

    #[tokio::test]
    async fn test_list_directory_mixed() {
        let temp = ProjectTempDir::new("list_dir_mixed");
        fs::create_dir(temp.path().join("folder")).unwrap();
        fs::write(temp.path().join("file.txt"), "content").unwrap();
        fs::write(temp.path().join(".hidden"), "hidden").unwrap();

        let result = list_directory(temp.path().to_string_lossy().to_string(), true)
            .await
            .unwrap();

        assert_eq!(result.len(), 3);
    }

    #[tokio::test]
    async fn test_list_directory_nonexistent() {
        let result = list_directory("/nonexistent/path".to_string(), false).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn test_list_directory_file_entry_fields() {
        let temp = ProjectTempDir::new("list_dir_fields");
        fs::write(temp.path().join("test.txt"), "test content").unwrap();

        let result = list_directory(temp.path().to_string_lossy().to_string(), false)
            .await
            .unwrap();

        assert_eq!(result.len(), 1);
        let entry = &result[0];
        assert_eq!(entry.name, "test.txt");
        assert!(!entry.is_dir);
        assert_eq!(entry.size, 12);
        assert!(!entry.size_formatted.is_empty());
        assert_eq!(entry.file_type, "txt");
        assert!(!entry.is_hidden);
        assert!(!entry.icon_id.is_empty());
    }
}

// =============================================================================
// list_files_sorted のテスト
// =============================================================================

mod list_files_sorted_tests {
    use super::*;

    #[tokio::test]
    async fn test_list_files_sorted_by_name() {
        let temp = ProjectTempDir::new("sorted_name");
        fs::write(temp.path().join("z_file.txt"), "z").unwrap();
        fs::write(temp.path().join("a_file.txt"), "a").unwrap();
        fs::write(temp.path().join("m_file.txt"), "m").unwrap();

        let result = list_files_sorted(
            temp.path().to_string_lossy().to_string(),
            false,
            "name".to_string(),
            false,
            String::new(),
        )
        .await
        .unwrap();

        assert_eq!(result.len(), 3);
        assert_eq!(result[0].name, "a_file.txt");
        assert_eq!(result[1].name, "m_file.txt");
        assert_eq!(result[2].name, "z_file.txt");
    }

    #[tokio::test]
    async fn test_list_files_sorted_by_name_desc() {
        let temp = ProjectTempDir::new("sorted_name_desc");
        fs::write(temp.path().join("a_file.txt"), "a").unwrap();
        fs::write(temp.path().join("z_file.txt"), "z").unwrap();

        let result = list_files_sorted(
            temp.path().to_string_lossy().to_string(),
            false,
            "name".to_string(),
            true,
            String::new(),
        )
        .await
        .unwrap();

        assert_eq!(result[0].name, "z_file.txt");
        assert_eq!(result[1].name, "a_file.txt");
    }

    #[tokio::test]
    async fn test_list_files_sorted_by_size() {
        let temp = ProjectTempDir::new("sorted_size");
        fs::write(temp.path().join("small.txt"), "x").unwrap();
        fs::write(temp.path().join("large.txt"), "xxxxxxxxxx").unwrap();

        let result = list_files_sorted(
            temp.path().to_string_lossy().to_string(),
            false,
            "size".to_string(),
            false,
            String::new(),
        )
        .await
        .unwrap();

        assert_eq!(result[0].name, "small.txt");
        assert_eq!(result[1].name, "large.txt");
    }

    #[tokio::test]
    async fn test_list_files_sorted_directories_first() {
        let temp = ProjectTempDir::new("sorted_dirs_first");
        fs::create_dir(temp.path().join("z_folder")).unwrap();
        fs::write(temp.path().join("a_file.txt"), "content").unwrap();

        let result = list_files_sorted(
            temp.path().to_string_lossy().to_string(),
            false,
            "name".to_string(),
            false,
            String::new(),
        )
        .await
        .unwrap();

        // Directory should come first regardless of name
        assert!(result[0].is_dir);
        assert!(!result[1].is_dir);
    }

    #[tokio::test]
    async fn test_list_files_sorted_with_search() {
        let temp = ProjectTempDir::new("sorted_search");
        fs::write(temp.path().join("apple.txt"), "a").unwrap();
        fs::write(temp.path().join("banana.txt"), "b").unwrap();
        fs::write(temp.path().join("cherry.txt"), "c").unwrap();

        let result = list_files_sorted(
            temp.path().to_string_lossy().to_string(),
            false,
            "name".to_string(),
            false,
            "an".to_string(),
        )
        .await
        .unwrap();

        assert_eq!(result.len(), 1);
        assert_eq!(result[0].name, "banana.txt");
    }

    #[tokio::test]
    async fn test_list_files_sorted_search_case_insensitive() {
        let temp = ProjectTempDir::new("sorted_search_case");
        fs::write(temp.path().join("Apple.txt"), "a").unwrap();
        fs::write(temp.path().join("BANANA.txt"), "b").unwrap();

        let result = list_files_sorted(
            temp.path().to_string_lossy().to_string(),
            false,
            "name".to_string(),
            false,
            "apple".to_string(),
        )
        .await
        .unwrap();

        assert_eq!(result.len(), 1);
    }

    #[tokio::test]
    async fn test_list_files_sorted_empty_search() {
        let temp = ProjectTempDir::new("sorted_empty_search");
        fs::write(temp.path().join("file.txt"), "content").unwrap();

        let result = list_files_sorted(
            temp.path().to_string_lossy().to_string(),
            false,
            "name".to_string(),
            false,
            String::new(),
        )
        .await
        .unwrap();

        assert_eq!(result.len(), 1);
    }
}

// =============================================================================
// complete_path のテスト
// =============================================================================

mod complete_path_tests {
    use super::*;

    #[tokio::test]
    async fn test_complete_path_basic() {
        let temp = ProjectTempDir::new("complete_basic");
        fs::create_dir(temp.path().join("Documents")).unwrap();
        fs::create_dir(temp.path().join("Downloads")).unwrap();
        fs::create_dir(temp.path().join("Desktop")).unwrap();
        fs::write(temp.path().join("file.txt"), "content").unwrap();

        let result = complete_path(
            temp.path().to_string_lossy().to_string(),
            "Doc".to_string(),
            false,
        )
        .await
        .unwrap();

        assert_eq!(result.len(), 1);
        assert_eq!(result[0].name, "Documents");
    }

    #[tokio::test]
    async fn test_complete_path_case_insensitive() {
        let temp = ProjectTempDir::new("complete_case");
        fs::create_dir(temp.path().join("FOLDER")).unwrap();

        let result = complete_path(
            temp.path().to_string_lossy().to_string(),
            "folder".to_string(),
            false,
        )
        .await
        .unwrap();

        assert_eq!(result.len(), 1);
    }

    #[tokio::test]
    async fn test_complete_path_no_match() {
        let temp = ProjectTempDir::new("complete_no_match");
        fs::create_dir(temp.path().join("Documents")).unwrap();

        let result = complete_path(
            temp.path().to_string_lossy().to_string(),
            "XYZ".to_string(),
            false,
        )
        .await
        .unwrap();

        assert!(result.is_empty());
    }

    #[tokio::test]
    async fn test_complete_path_files_excluded() {
        let temp = ProjectTempDir::new("complete_files");
        fs::create_dir(temp.path().join("Docs_folder")).unwrap();
        fs::write(temp.path().join("Docs_file.txt"), "content").unwrap();

        let result = complete_path(
            temp.path().to_string_lossy().to_string(),
            "Docs".to_string(),
            false,
        )
        .await
        .unwrap();

        // Only directories should be returned
        assert_eq!(result.len(), 1);
        assert!(result[0].is_dir);
    }

    #[tokio::test]
    async fn test_complete_path_empty_prefix() {
        let temp = ProjectTempDir::new("complete_empty");
        fs::create_dir(temp.path().join("Folder1")).unwrap();
        fs::create_dir(temp.path().join("Folder2")).unwrap();

        let result = complete_path(
            temp.path().to_string_lossy().to_string(),
            String::new(),
            false,
        )
        .await
        .unwrap();

        assert_eq!(result.len(), 2);
    }

    #[tokio::test]
    async fn test_complete_path_sorted() {
        let temp = ProjectTempDir::new("complete_sorted");
        fs::create_dir(temp.path().join("Zebra")).unwrap();
        fs::create_dir(temp.path().join("Apple")).unwrap();
        fs::create_dir(temp.path().join("Mango")).unwrap();

        let result = complete_path(
            temp.path().to_string_lossy().to_string(),
            String::new(),
            false,
        )
        .await
        .unwrap();

        // Should be sorted alphabetically
        assert_eq!(result[0].name, "Apple");
        assert_eq!(result[1].name, "Mango");
        assert_eq!(result[2].name, "Zebra");
    }
}
