import { invoke } from '@tauri-apps/api/core';
import { FileEntry, ContentSearchResult, FileHashes, FilePreview, XattrInfo } from '@/types';

export const ipc = {
    listDirectory: (path: string) => invoke<FileEntry[]>('list_directory', { path }),
    createDirectory: (path: string) => invoke<void>('create_directory', { path }),
    deleteFiles: (paths: string[], toTrash: boolean = true) => invoke<void>('delete_files', { paths, toTrash }),
    renameFile: (path: string, newName: string) => invoke<void>('rename_file', { path, newName }),
    copyFiles: (sources: string[], dest: string) => invoke<void>('copy_files', { sources, dest }),
    moveFiles: (sources: string[], dest: string) => invoke<void>('move_files', { sources, dest }),
    compressArchive: (sources: string[], destArchivePath: string) => invoke<void>('compress_archive', { sources, destArchivePath }),
    extractArchive: (sourcePath: string, destDir: string) => invoke<void>('extract_archive', { sourcePath, destDir }),
    listFilesSorted: (path: string, showHidden: boolean, sortBy: string, sortDesc: boolean, searchQuery: string) =>
        invoke<FileEntry[]>('list_files_sorted', { path, showHidden, sortBy, sortDesc, searchQuery }),
    showProperties: (path: string) => invoke<void>('show_properties', { path }),
    checkExists: (path: string) => invoke<boolean>('check_exists', { path }),
    createFile: (path: string) => invoke<void>('create_file', { path }),
    getHomeDir: () => invoke<string>('get_home_dir'),
    openFileDefault: (path: string) => invoke<void>('open_file_default', { path }),
    createSymlink: (target: string, linkPath: string) => invoke<void>('create_symlink', { target, linkPath }),
    searchFileContents: (dir: string, query: string) => invoke<ContentSearchResult>('search_file_contents', { dir, query }),
    calculateFileHash: (path: string) => invoke<FileHashes>('calculate_file_hash', { path }),
    getFilePreview: (path: string) => invoke<FilePreview>('get_file_preview', { path }),
    listXattrs: (path: string) => invoke<XattrInfo[]>('list_xattrs', { path }),
    removeXattr: (path: string, name: string) => invoke<void>('remove_xattr', { path, name }),
};
