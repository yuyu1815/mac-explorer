import React, { useEffect, useState, useRef } from 'react';
import { invoke, Channel } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { FileIcon } from '@/components/features/file-manager/MainPane';
import styles from '@/styles/components/dialogs/PropertiesDialog.module.css';

interface PropertyProgress {
    size_bytes: number;
    size_formatted: string;
    size_on_disk_bytes: number;
    size_on_disk_formatted: string;
    contains_files: number;
    contains_folders: number;
    complete: boolean;
}

interface ApplicationInfo {
    name: string;
    path: string;
    icon_id: string;
    bundle_identifier: string;
}

interface PropertiesDialogProps {
    path: string;
}

interface DetailedProperties {
    name: string;
    path: string;
    file_type: string;
    location: string;
    size_bytes: number;
    size_formatted: string;
    size_on_disk_bytes: number;
    size_on_disk_formatted: string;
    contains_files: number;
    contains_folders: number;
    created_formatted: string;
    modified_formatted: string;
    accessed_formatted: string;
    is_readonly: boolean;
    is_hidden: boolean;
    is_hidden_editable: boolean;  // ドットファイルはchflagsで変更できないためfalse
    default_application: string | null;
    default_application_icon_id: string | null;
}

interface DiskProperties {
    name: string;
    path: string;
    file_system: string;
    total_bytes: number;
    free_bytes: number;
    used_bytes: number;
    total_bytes_formatted: string;
    free_bytes_formatted: string;
    used_bytes_formatted: string;
    is_network?: boolean;
}

export const PropertiesDialog: React.FC<PropertiesDialogProps> = ({ path }) => {
    const [fileProps, setFileProps] = useState<DetailedProperties | null>(null);
    const [diskProps, setDiskProps] = useState<DiskProperties | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // 編集中の状態を保持するバッファ
    const [pendingName, setPendingName] = useState("");
    const [pendingReadonly, setPendingReadonly] = useState(false);
    const [pendingHidden, setPendingHidden] = useState(false);
    const [pendingApp, setPendingApp] = useState<ApplicationInfo | null>(null);
    const [applying, setApplying] = useState(false);

    const [showAppMenu, setShowAppMenu] = useState(false);
    const [applications, setApplications] = useState<ApplicationInfo[]>([]);
    const [loadingApps, setLoadingApps] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const isDir = fileProps?.file_type === 'ファイル フォルダー';
    const iconId = fileProps ? (isDir ? 'dir' : '') : (diskProps ? 'disk' : '');

    // 変更があるかどうかを判定
    const isDirty = fileProps ? (
        pendingName !== fileProps.name ||
        pendingReadonly !== fileProps.is_readonly ||
        pendingHidden !== fileProps.is_hidden ||
        (pendingApp !== null && pendingApp.bundle_identifier !== fileProps.default_application)
    ) : false;

    const handleClose = async () => {
        await getCurrentWebviewWindow().close();
    };

    const handleApply = async () => {
        if (!fileProps || !isDirty || applying) return;
        setApplying(true);
        try {
            // アプリケーションの変更（最初に実行）
            if (pendingApp !== null && pendingApp.bundle_identifier !== fileProps.default_application) {
                await invoke('set_default_application', {
                    path: fileProps.path,
                    bundleIdentifier: pendingApp.bundle_identifier
                });
            }

            // 属性の変更
            if (pendingReadonly !== fileProps.is_readonly) {
                await invoke('set_readonly', { path: fileProps.path, readonly: pendingReadonly });
            }
            if (pendingHidden !== fileProps.is_hidden) {
                await invoke('set_hidden', { path: fileProps.path, hidden: pendingHidden });
            }

            // 名前の変更（最後に実行しないとパスが変わる可能性があるため）
            let currentPath = fileProps.path;
            if (pendingName !== fileProps.name) {
                await invoke('rename_file', { path: fileProps.path, newName: pendingName });
                // リネーム後はパスが変わるので親ディレクトリから新しいパスを構築
                const parent = fileProps.location;
                currentPath = `${parent}${parent.endsWith('/') ? '' : '/'}${pendingName}`;
            }

            // 成功したらpropsを更新してdirtyを解消
            setFileProps({
                ...fileProps,
                path: currentPath,
                name: pendingName,
                is_readonly: pendingReadonly,
                is_hidden: pendingHidden,
                default_application: pendingApp?.name ?? fileProps.default_application,
                default_application_icon_id: pendingApp?.icon_id ?? fileProps.default_application_icon_id,
            });
            setPendingApp(null);
            return true;
        } catch (err: any) {
            setError(err.toString());
            return false;
        } finally {
            setApplying(false);
        }
    };

    const handleOK = async () => {
        if (isDirty) {
            const success = await handleApply();
            if (!success) return; // エラーがあれば閉じない
        }
        handleClose();
    };

    // 外部クリックでドロップダウンを閉じる
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowAppMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const loadApplications = async () => {
        if (loadingApps || applications.length > 0) return;
        setLoadingApps(true);
        try {
            const apps = await invoke<ApplicationInfo[]>('get_applications_for_file', { path });
            setApplications(apps);
        } catch (err) {
            console.error('Failed to load applications:', err);
        } finally {
            setLoadingApps(false);
        }
    };

    const handleAppSelect = (app: ApplicationInfo) => {
        setPendingApp(app);
        setShowAppMenu(false);
    };

    useEffect(() => {
        let mounted = true;

        const fetchProperties = async () => {
            try {
                setLoading(true);

                // ディスク情報かどうかを判定 (パスが / または /Volumes/ で始まる場合など)
                // より確実に、まず get_disk_properties を試すか、パスで判断
                const isDisk = path === '/' || path.startsWith('/Volumes/');

                if (isDisk) {
                    try {
                        const data: DiskProperties = await invoke('get_disk_properties', { path });
                        if (!mounted) return;
                        setDiskProps(data);
                        setPendingName(data.name);
                        setLoading(false);
                        return;
                    } catch (err) {
                        console.log('Not a disk path or failed to get disk props, fallback to basic props');
                    }
                }

                // まず基本情報を取得
                const data: DetailedProperties = await invoke('get_basic_properties', { path });
                if (!mounted) return;
                setFileProps(data);
                setPendingName(data.name);
                setPendingReadonly(data.is_readonly);
                setPendingHidden(data.is_hidden);

                // フォルダの場合は即座にUIを表示して、バックグラウンドで計算
                if (data.file_type === 'ファイル フォルダー') {
                    setLoading(false);

                    const channel = new Channel<PropertyProgress>((progress) => {
                        if (!mounted) return;
                        // 進捗をリアルタイムに反映
                        setFileProps(prev => prev ? {
                            ...prev,
                            size_bytes: progress.size_bytes,
                            size_formatted: progress.size_formatted,
                            size_on_disk_bytes: progress.size_on_disk_bytes,
                            size_on_disk_formatted: progress.size_on_disk_formatted,
                            contains_files: progress.contains_files,
                            contains_folders: progress.contains_folders,
                        } : null);
                    });

                    await invoke('get_detailed_properties_streaming', {
                        path,
                        channel,
                    });
                } else {
                    setLoading(false);
                }
            } catch (err: any) {
                if (mounted) {
                    setError(err.toString());
                    setLoading(false);
                }
            }
        };

        fetchProperties();

        return () => {
            mounted = false;
        };
    }, [path]);

    return (
        <div data-tauri-drag-region className={styles.window}>
            <div data-tauri-drag-region className={styles.titlebar}>
                <div data-tauri-drag-region className={styles.titlebarText}>
                    {diskProps ? `${diskProps.name}のプロパティ` : (fileProps ? `${fileProps.name}のプロパティ` : 'プロパティ')}
                </div>
                <div className={styles.titlebarClose} onClick={handleClose}>✕</div>
            </div>

            <div className={styles.content}>
                {loading ? (
                    <div className={styles.loading}>読み込み中...</div>
                ) : error ? (
                    <div className={styles.error}>エラー: {error}</div>
                ) : diskProps ? (
                    <div className={styles.tabsContainer}>
                        <div className={styles.tabs}>
                            <div className={`${styles.tab} ${styles.active}`}>全般</div>
                            <div className={styles.tab}>ツール</div>
                            <div className={styles.tab}>ハードウェア</div>
                            <div className={styles.tab}>共有</div>
                        </div>

                        <div className={styles.tabContent}>
                            <div className={`${styles.row} ${styles.headerRow}`}>
                                <div className={styles.icon}>
                                    <FileIcon isDir={false} iconId="disk" size={32} />
                                </div>
                                <input
                                    type="text"
                                    className={styles.nameInput}
                                    value={pendingName}
                                    onChange={e => setPendingName(e.target.value)}
                                />
                            </div>

                            <div className={styles.divider}></div>

                            <div className={styles.row}>
                                <div className={styles.label}>種類:</div>
                                <div className={styles.value}>{diskProps.is_network ? 'ネットワーク ディスク' : 'ローカル ディスク'}</div>
                            </div>
                            <div className={styles.row}>
                                <div className={styles.label}>ファイル システム:</div>
                                <div className={styles.value}>{diskProps.file_system}</div>
                            </div>

                            <div className={styles.divider}></div>

                            <div className={styles.row}>
                                <div className={styles.diskUsageBlock}>
                                    <div className={styles.usageRow}>
                                        <div className={styles.usageLabel}>
                                            <div className={styles.colorIndicator} style={{ backgroundColor: '#0078D7' }}></div>
                                            使用領域:
                                        </div>
                                        <div className={styles.usageValue}>{diskProps.used_bytes.toLocaleString()} バイト</div>
                                        <div className={styles.usageValueFormatted}>{diskProps.used_bytes_formatted}</div>
                                    </div>
                                    <div className={styles.usageRow}>
                                        <div className={styles.usageLabel}>
                                            <div className={styles.colorIndicator} style={{ backgroundColor: '#E1E1E1' }}></div>
                                            空き領域:
                                        </div>
                                        <div className={styles.usageValue}>{diskProps.free_bytes.toLocaleString()} バイト</div>
                                        <div className={styles.usageValueFormatted}>{diskProps.free_bytes_formatted}</div>
                                    </div>
                                    <div className={styles.usageRow} style={{ marginTop: '4px' }}>
                                        <div className={styles.usageLabel}>容量:</div>
                                        <div className={styles.usageValue}>{diskProps.total_bytes.toLocaleString()} バイト</div>
                                        <div className={styles.usageValueFormatted}>{diskProps.total_bytes_formatted}</div>
                                    </div>
                                </div>
                            </div>

                            <div className={styles.diskChartRow}>
                                <div className={styles.diskChartContainer}>
                                    <svg viewBox="0 0 100 100" className={styles.donutChart}>
                                        <circle cx="50" cy="50" r="40" fill="transparent" stroke="#E1E1E1" strokeWidth="20" />
                                        <circle cx="50" cy="50" r="40" fill="transparent" stroke="#0078D7" strokeWidth="20"
                                            strokeDasharray={`${(diskProps.used_bytes / diskProps.total_bytes) * 251.32} 251.32`}
                                            transform="rotate(-90 50 50)" />
                                    </svg>
                                    <div className={styles.chartLabel}>ドライブ {diskProps.path === '/' ? 'C' : diskProps.path.split('/').pop()}:</div>
                                </div>
                            </div>


                        </div>
                    </div>
                ) : fileProps ? (
                    <div className={styles.tabsContainer}>
                        <div className={styles.tabs}>
                            <div className={`${styles.tab} ${styles.active}`}>全般</div>
                        </div>

                        <div className={styles.tabContent}>
                            <div className={`${styles.row} ${styles.headerRow}`}>
                                <div className={styles.icon}>
                                    <FileIcon isDir={isDir} iconId={iconId} size={32} />
                                </div>
                                <input
                                    type="text"
                                    className={styles.nameInput}
                                    value={pendingName}
                                    onChange={e => setPendingName(e.target.value)}
                                />
                            </div>

                            <div className={styles.divider}></div>

                            <div className={styles.row}>
                                <div className={styles.label}>ファイルの種類:</div>
                                <div className={styles.value}>{fileProps.file_type}</div>
                            </div>
                            {!isDir && (
                                <div className={styles.row}>
                                    <div className={styles.label}>プログラム:</div>
                                    <div className={styles.valueWithIcon} ref={dropdownRef}>
                                        {(pendingApp?.icon_id ?? fileProps.default_application_icon_id) && (
                                            <FileIcon isDir={false} iconId={pendingApp?.icon_id ?? fileProps.default_application_icon_id ?? ''} size={16} />
                                        )}
                                        <span>{pendingApp?.name ?? fileProps.default_application ?? '(不明)'}</span>
                                        {' '}
                                        <div className={styles.appSelector}>
                                            <button
                                                className={styles.btnSmall}
                                                onClick={() => {
                                                    setShowAppMenu(!showAppMenu);
                                                    loadApplications();
                                                }}
                                            >
                                                変更(C)...
                                            </button>
                                            {showAppMenu && (
                                                <div className={styles.appDropdown}>
                                                    {loadingApps ? (
                                                        <div className={styles.appLoading}>読み込み中...</div>
                                                    ) : (
                                                        applications.map(app => (
                                                            <div
                                                                key={app.bundle_identifier}
                                                                className={styles.appItem}
                                                                onClick={() => handleAppSelect(app)}
                                                            >
                                                                <FileIcon isDir={false} iconId={app.icon_id} size={16} />
                                                                <span>{app.name}</span>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className={styles.divider}></div>

                            <div className={styles.row}>
                                <div className={styles.label}>場所:</div>
                                <div className={styles.value}>{fileProps.location}</div>
                            </div>
                            <div className={styles.row}>
                                <div className={styles.label}>サイズ:</div>
                                <div className={styles.value}>{fileProps.size_formatted} ({fileProps.size_bytes.toLocaleString()} バイト)</div>
                            </div>
                            <div className={styles.row}>
                                <div className={styles.label}>ディスク上のサイズ:</div>
                                <div className={styles.value}>{fileProps.size_on_disk_formatted} ({fileProps.size_on_disk_bytes.toLocaleString()} バイト)</div>
                            </div>
                            {isDir && (
                                <div className={styles.row}>
                                    <div className={styles.label}>内容:</div>
                                    <div className={styles.value}>{fileProps.contains_files} ファイル、{fileProps.contains_folders} フォルダー</div>
                                </div>
                            )}

                            <div className={styles.divider}></div>

                            <div className={styles.row}>
                                <div className={styles.label}>作成日時:</div>
                                <div className={styles.value}>{fileProps.created_formatted}</div>
                            </div>
                            <div className={styles.row}>
                                <div className={styles.label}>更新日時:</div>
                                <div className={styles.value}>{fileProps.modified_formatted}</div>
                            </div>
                            <div className={styles.row}>
                                <div className={styles.label}>アクセス日時:</div>
                                <div className={styles.value}>{fileProps.accessed_formatted}</div>
                            </div>

                            <div className={styles.divider}></div>

                            <div className={styles.row}>
                                <div className={styles.label}>属性:</div>
                                <div className={styles.attrs}>
                                    <label>
                                        <input
                                            type="checkbox"
                                            checked={pendingReadonly}
                                            onChange={e => setPendingReadonly(e.target.checked)}
                                        /> 読み取り専用(R)
                                    </label>
                                    <label>
                                        <input
                                            type="checkbox"
                                            checked={pendingHidden}
                                            onChange={e => setPendingHidden(e.target.checked)}
                                            disabled={!fileProps.is_hidden_editable}
                                        /> 隠しファイル(H)
                                    </label>
                                </div>
                                <div className={styles.btnAdvanced}><button className={styles.btnSmall} disabled>詳細設定(D)...</button></div>
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>

            <div className={styles.footer}>
                <button className={styles.btn} onClick={handleOK}>OK</button>
                <button className={styles.btn} onClick={handleClose}>キャンセル</button>
                <button className={styles.btn} onClick={handleApply} disabled={!isDirty || applying}>
                    {applying ? '適用中...' : '適用(A)'}
                </button>
            </div>
        </div>
    );
};
