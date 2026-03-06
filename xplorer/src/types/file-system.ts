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
    permissions: string;
    icon_id: string;
}

export type ViewMode = 'extra_large_icon' | 'large_icon' | 'medium_icon' | 'small_icon' | 'list' | 'detail' | 'tiles' | 'content';
export type SortColumn = 'name' | 'modified' | 'file_type' | 'size';
