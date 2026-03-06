use std::path::Path;
use libarchive2::{FileType, ReadArchive};
use std::fs::File;
use std::io::Write;

fn main() {
    let src = "/Users/yuyu/Downloads/kali-linux-2025.4-virtualbox-amd64.7z";
    let dest = "/Users/yuyu/Downloads/kali-linux-test-extract";

    println!("Starting extraction test for {}", src);
    let dest_path = Path::new(dest);
    if !dest_path.exists() {
        std::fs::create_dir_all(dest_path).unwrap();
    }

    let mut total_files = 0;

    // To test streaming efficiently, skip counting and just start extracting
    /*
    println!("Counting entries...");
    match ReadArchive::open(src) {
        Ok(mut temp_archive) => {
            while let Ok(Some(_entry)) = temp_archive.next_entry() {
                total_files += 1;
            }
            println!("Total entries to extract: {}", total_files);
        }
        Err(e) => {
            println!("Failed to open archive for counting: {}", e);
            return;
        }
    */
    let total_files = 3; // Hardcoded based on previous run

    println!("Extracting...");
    let mut files_processed = 0;
    let mut bytes_processed = 0u64;
    
    match ReadArchive::open(src) {
        Ok(mut archive) => {
            while let Ok(Some(entry)) = archive.next_entry() {
                let path = entry.pathname().unwrap_or_default();
                let is_dir = entry.file_type() == FileType::Directory;
                
                let out_path = dest_path.join(&path);
                
                if is_dir || path.ends_with('/') || path.is_empty() {
                    std::fs::create_dir_all(&out_path).unwrap_or_default();
                    files_processed += 1;
                    continue;
                }

                if let Some(parent) = out_path.parent() {
                    std::fs::create_dir_all(parent).unwrap_or_default();
                }

                match File::create(&out_path) {
                    Ok(mut output) => {
                        let mut buf = [0u8; 65536]; // 64KB chunk
                        loop {
                            match archive.read_data(&mut buf) {
                                Ok(0) => break, // EOF
                                Ok(n) => {
                                    if let Err(e) = output.write_all(&buf[..n]) {
                                        println!("Failed to create file {}: {}", out_path.display(), e);
                                        break;
                                    }
                                    bytes_processed += n as u64;
                                }
                                Err(e) => {
                                    println!("Failed to read data for {}: {}", path, e);
                                    break;
                                }
                            }
                        }
                    }
                    Err(e) => {
                        println!("Failed to create file {}: {}", out_path.display(), e);
                    }
                }
                
                files_processed += 1;
                if files_processed % 1 == 0 {
                    println!("Progress: {}/{} files ({} bytes)", files_processed, total_files, bytes_processed);
                }
            }
            println!("Extraction complete! Files processed: {}", files_processed);
        }
        Err(e) => {
            println!("Failed to open archive for extracting: {}", e);
        }
    }
}
