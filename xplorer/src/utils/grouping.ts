import { FileEntry, GroupBy } from '@/types';

export interface FileGroup {
    key: string;
    label: string;
    files: FileEntry[];
}

// 名前の頭文字を Windows エクスプローラー準拠の帯（0-9 / A-H / I-P / Q-Z / その他）に振り分ける
const nameBand = (file: FileEntry): { key: string; label: string } => {
    const first = file.name.charAt(0).toUpperCase();
    if (first >= '0' && first <= '9') return { key: '0-9', label: '0-9' };
    if (first >= 'A' && first <= 'H') return { key: 'A-H', label: 'A-H' };
    if (first >= 'I' && first <= 'P') return { key: 'I-P', label: 'I-P' };
    if (first >= 'Q' && first <= 'Z') return { key: 'Q-Z', label: 'Q-Z' };
    return { key: 'other', label: 'その他' };
};

const typeBand = (file: FileEntry): { key: string; label: string } => {
    if (file.is_dir) return { key: 'folder', label: 'ファイル フォルダー' };
    if (!file.file_type) return { key: 'file', label: 'ファイル' };
    const ext = file.file_type.toLowerCase();
    return { key: ext, label: `${ext.toUpperCase()} ファイル` };
};

// サイズ帯の定義。上限（byte）の昇順で評価する
const SIZE_BANDS: { key: string; label: string; max: number }[] = [
    { key: 'empty', label: '空 (0 KB)', max: 0 },
    { key: 'tiny', label: '極小 (0 - 10 KB)', max: 10 * 1024 },
    { key: 'small', label: '小 (10 - 100 KB)', max: 100 * 1024 },
    { key: 'medium', label: '中 (100 KB - 1 MB)', max: 1024 * 1024 },
    { key: 'large', label: '大 (1 - 16 MB)', max: 16 * 1024 * 1024 },
    { key: 'huge', label: '巨大 (16 MB 以上)', max: Infinity },
];

const sizeBand = (file: FileEntry): { key: string; label: string } => {
    if (file.is_dir) return { key: 'folder', label: 'フォルダー' };
    const band = SIZE_BANDS.find(b => file.size <= b.max) ?? SIZE_BANDS[SIZE_BANDS.length - 1];
    return { key: band.key, label: band.label };
};

// 更新日時帯の定義。経過秒数の上限の昇順で評価する。境界は呼び出し時刻起点で算出する
const dateBand = (file: FileEntry, nowSec: number): { key: string; label: string } => {
    const DAY = 86400;
    const elapsed = nowSec - file.modified;
    const bands: { key: string; label: string; max: number }[] = [
        { key: 'today', label: '今日', max: DAY },
        { key: 'yesterday', label: '昨日', max: 2 * DAY },
        { key: 'thisWeek', label: '今週', max: 7 * DAY },
        { key: 'lastMonth', label: '先月', max: 30 * DAY },
        { key: 'thisYear', label: '今年', max: 365 * DAY },
        { key: 'longAgo', label: 'かなり前', max: Infinity },
    ];
    const band = bands.find(b => elapsed < b.max) ?? bands[bands.length - 1];
    return { key: band.key, label: band.label };
};

type Classifier = (file: FileEntry, nowSec: number) => { key: string; label: string };

const CLASSIFIERS: Record<Exclude<GroupBy, 'none'>, Classifier> = {
    name: nameBand,
    type: typeBand,
    size: sizeBand,
    dateModified: dateBand,
};

// ソート済みの files を受け取り、現在の並び順を保ったままグループへ分割する純粋関数
export const groupFiles = (files: FileEntry[], groupBy: GroupBy): FileGroup[] => {
    if (groupBy === 'none') return [{ key: 'all', label: '', files }];

    const classify = CLASSIFIERS[groupBy];
    const nowSec = Math.floor(Date.now() / 1000);

    const order: string[] = [];
    const groups = new Map<string, FileGroup>();

    files.forEach(file => {
        const { key, label } = classify(file, nowSec);
        const existing = groups.get(key);
        if (existing) {
            existing.files.push(file);
            return;
        }
        order.push(key);
        groups.set(key, { key, label, files: [file] });
    });

    return order.map(key => groups.get(key)!);
};
