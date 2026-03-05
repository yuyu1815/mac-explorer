import React, { useEffect, useState } from 'react';
import { invoke, Channel } from '@tauri-apps/api/core';
import { FileIcon } from './MainPane';
import { useAppStore } from '../stores/appStore';
import '../styles/components/PropertiesDialog.css';

interface PropertyProgress {
    size_bytes: number;
    size_formatted: string;
    size_on_disk_bytes: number;
    size_on_disk_formatted: string;
    contains_files: number;
    contains_folders: number;
    complete: boolean;
}

interface PropertiesDialogProps {
    path: string;
    onClose: () => void;
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
}

export const PropertiesDialog: React.FC<PropertiesDialogProps> = ({ path, onClose }) => {
    const [props, setProps] = useState<DetailedProperties | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [nameInputValue, setNameInputValue] = useState("");

    // Need to get the entry to access icon_id
    const activeTab = useAppStore(state => state.tabs.find(t => t.id === useAppStore.getState().activeTabId));
    const entry = activeTab?.files.find(f => f.path === path);
    const isDir = props?.file_type === 'ファイル フォルダー';
    const iconId = entry?.icon_id || (isDir ? 'dir' : '');

    useEffect(() => {
        let mounted = true;

        const fetchProperties = async () => {
            try {
                setLoading(true);
                // まず基本情報を取得
                const data: DetailedProperties = await invoke('get_basic_properties', { path });
                if (!mounted) return;
                setProps(data);
                setNameInputValue(data.name);

                // フォルダの場合は即座にUIを表示して、バックグラウンドで計算
                if (data.file_type === 'ファイル フォルダー') {
                    setLoading(false);

                    const channel = new Channel<PropertyProgress>((progress) => {
                        if (!mounted) return;
                        // 進捗をリアルタイムに反映
                        setProps(prev => prev ? {
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
        <div className="properties-dialog-overlay" onMouseDown={onClose}>
            <div className="properties-dialog-window" onMouseDown={e => e.stopPropagation()}>
                <div className="properties-dialog-titlebar">
                    <div className="titlebar-text">{props ? `${props.name}のプロパティ` : 'プロパティ'}</div>
                    <div className="titlebar-close" onClick={onClose}>✕</div>
                </div>

                <div className="properties-dialog-content">
                    {loading ? (
                        <div className="properties-loading">読み込み中...</div>
                    ) : error ? (
                        <div className="properties-error">エラー: {error}</div>
                    ) : props ? (
                        <div className="properties-tabs-container">
                            <div className="properties-tabs">
                                <div className="properties-tab active">全般</div>
                            </div>

                            <div className="properties-tab-content">
                                <div className="prop-row prop-header">
                                    <div className="prop-icon">
                                        <FileIcon isDir={isDir} iconId={iconId} size={32} />
                                    </div>
                                    <input
                                        type="text"
                                        className="prop-name-input"
                                        value={nameInputValue}
                                        onChange={e => setNameInputValue(e.target.value)}
                                        readOnly // Rename unsupported here yet
                                    />
                                </div>

                                <div className="prop-divider"></div>

                                <div className="prop-row">
                                    <div className="prop-label">ファイルの種類:</div>
                                    <div className="prop-value">{props.file_type}</div>
                                </div>
                                {!isDir && (
                                    <div className="prop-row">
                                        <div className="prop-label">プログラム:</div>
                                        <div className="prop-value">(不明) <button className="prop-btn-small" disabled>変更(C)...</button></div>
                                    </div>
                                )}

                                <div className="prop-divider"></div>

                                <div className="prop-row">
                                    <div className="prop-label">場所:</div>
                                    <div className="prop-value">{props.location}</div>
                                </div>
                                <div className="prop-row">
                                    <div className="prop-label">サイズ:</div>
                                    <div className="prop-value">{props.size_formatted} ({props.size_bytes.toLocaleString()} バイト)</div>
                                </div>
                                <div className="prop-row">
                                    <div className="prop-label">ディスク上のサイズ:</div>
                                    <div className="prop-value">{props.size_on_disk_formatted} ({props.size_on_disk_bytes.toLocaleString()} バイト)</div>
                                </div>
                                {isDir && (
                                    <div className="prop-row">
                                        <div className="prop-label">内容:</div>
                                        <div className="prop-value">{props.contains_files} ファイル、{props.contains_folders} フォルダー</div>
                                    </div>
                                )}

                                <div className="prop-divider"></div>

                                <div className="prop-row">
                                    <div className="prop-label">作成日時:</div>
                                    <div className="prop-value">{props.created_formatted}</div>
                                </div>
                                <div className="prop-row">
                                    <div className="prop-label">更新日時:</div>
                                    <div className="prop-value">{props.modified_formatted}</div>
                                </div>
                                <div className="prop-row">
                                    <div className="prop-label">アクセス日時:</div>
                                    <div className="prop-value">{props.accessed_formatted}</div>
                                </div>

                                <div className="prop-divider"></div>

                                <div className="prop-row">
                                    <div className="prop-label">属性:</div>
                                    <div className="prop-attrs">
                                        <label><input type="checkbox" checked={props.is_readonly} readOnly /> 読み取り専用(R)</label>
                                        <label><input type="checkbox" checked={props.is_hidden} readOnly /> 隠しファイル(H)</label>
                                    </div>
                                    <div className="prop-btn-advanced"><button className="prop-btn-small" disabled>詳細設定(D)...</button></div>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </div>

                <div className="properties-dialog-footer">
                    <button className="prop-btn" onClick={onClose}>OK</button>
                    <button className="prop-btn" onClick={onClose}>キャンセル</button>
                    <button className="prop-btn" disabled>適用(A)</button>
                </div>
            </div>
        </div>
    );
};
