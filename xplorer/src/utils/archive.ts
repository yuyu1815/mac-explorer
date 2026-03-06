/// libarchive2がサポートするアーカイブ形式
const SUPPORTED_FORMATS = [
    '.zip', '.7z', '.tar', '.tar.gz', '.tgz',
    '.tar.bz2', '.tar.xz', '.tar.zst'
] as const;

/// アーカイブ形式の拡張子をチェック（libarchive2が対応する形式のみ）
export const isArchive = (path: string | null | undefined): boolean => {
    if (!path) return false;
    const lower = path.toLowerCase();
    return SUPPORTED_FORMATS.some(ext => lower.endsWith(ext));
};

/// アーカイブ形式の拡張子からフォーマット名を取得（libarchive2が対応する形式のみ）
export const getArchiveFormat = (path: string): string => {
    const lower = path.toLowerCase();
    if (lower.endsWith('.zip')) return 'zip';
    if (lower.endsWith('.7z')) return '7z';
    if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) return 'tar.gz';
    if (lower.endsWith('.tar.bz2')) return 'tar.bz2';
    if (lower.endsWith('.tar.xz')) return 'tar.xz';
    if (lower.endsWith('.tar.zst')) return 'tar.zst';
    if (lower.endsWith('.tar')) return 'tar';
    // 不明な形式はデフォルトでZIP（archive.rs側のフォールバックと一致）
    return 'zip';
};

/// 圧縮形式のフィルタ定義（libarchive2が対応する形式のみ）
export const archiveFilters = [
    { name: 'ZIP Archive', extensions: ['zip'] },
    { name: '7-Zip Archive', extensions: ['7z'] },
    { name: 'TAR Archive', extensions: ['tar'] },
    { name: 'TAR.GZ Archive', extensions: ['tar.gz', 'tgz'] },
    { name: 'TAR.BZ2 Archive', extensions: ['tar.bz2'] },
    { name: 'TAR.XZ Archive', extensions: ['tar.xz'] },
    { name: 'TAR.ZST Archive', extensions: ['tar.zst'] },
];

/// パスからファイル名（拡張子なし）を取得
export const getFileNameWithoutExtension = (path: string): string => {
    const parts = path.split('/');
    const fileName = parts[parts.length - 1] || 'archive';
    return fileName.replace(/\.[^.]+$/, '');
};
