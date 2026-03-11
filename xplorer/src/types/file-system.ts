export interface FileEntry {
    name: string;
    path: string;
    is_dir: boolean;
    size: number;
    size_formatted: string;
    modified: number;
    modified_formatted: string;
    created: number;
    created_formatted: string;
    file_type: string;
    is_hidden: boolean;
    is_symlink: boolean;
    is_archive: boolean;
    permissions: string;
    icon_id: string;
    is_noaccess: boolean;
}

export interface VolumeInfo {
    name: string;
    path: string;
    total_bytes: number;
    free_bytes: number;
    total_bytes_formatted: string;
    free_bytes_formatted: string;
    is_network?: boolean;
    file_system?: string;
    is_cloud?: boolean;
    cloud_provider?: string;
}

export type ViewMode = 'extra_large_icon' | 'large_icon' | 'medium_icon' | 'small_icon' | 'list' | 'detail' | 'tiles' | 'content';
export type SortColumn = 'name' | 'modified' | 'file_type' | 'size';
