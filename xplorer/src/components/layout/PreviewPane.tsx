import { useState, useEffect } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { FileImage, FileText, FileVideo, FileAudio, FileQuestion } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { ipc } from '@/services/ipc';
import { FilePreview, PreviewKind } from '@/types';
import styles from '@/styles/components/layout/PreviewPane.module.css';

const NON_VIEWABLE_ICON: Record<Exclude<PreviewKind, 'text' | 'image'>, React.ReactNode> = {
    pdf: <FileText size={64} strokeWidth={1} color="#E81123" />,
    video: <FileVideo size={64} strokeWidth={1} color="#0078D7" />,
    audio: <FileAudio size={64} strokeWidth={1} color="#217346" />,
    binary: <FileQuestion size={64} strokeWidth={1} color="#888" />,
};

export const PreviewPane = () => {
    const { tabs, activeTabId } = useAppStore();
    const activeTab = tabs.find(t => t.id === activeTabId);
    const selectedFiles = activeTab?.selectedFiles ?? new Set<string>();
    const files = activeTab?.files ?? [];

    // 単一選択かつディレクトリでない場合のみプレビュー対象
    const selectedPath = selectedFiles.size === 1 ? Array.from(selectedFiles)[0] : null;
    const selectedEntry = selectedPath ? files.find(f => f.path === selectedPath) : null;
    const previewablePath = selectedEntry && !selectedEntry.is_dir ? selectedPath : null;

    const [preview, setPreview] = useState<FilePreview | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!previewablePath) {
            setPreview(null);
            setError(null);
            return;
        }

        let cancelled = false;
        setPreview(null);
        setError(null);

        ipc.getFilePreview(previewablePath)
            .then(result => { if (!cancelled) setPreview(result); })
            .catch(err => { if (!cancelled) setError(String(err)); });

        return () => { cancelled = true; };
    }, [previewablePath]);

    return (
        <div className={styles.previewPane}>
            <PreviewBody previewablePath={previewablePath} preview={preview} error={error} />
        </div>
    );
};

type BodyProps = {
    previewablePath: string | null;
    preview: FilePreview | null;
    error: string | null;
};

const PreviewBody = ({ previewablePath, preview, error }: BodyProps) => {
    if (!previewablePath) {
        return <Message text="プレビューするファイルを選択してください" />;
    }
    if (error) {
        return <Message text="プレビューを取得できませんでした" />;
    }
    if (!preview) {
        return <Message text="読み込み中..." />;
    }
    if (preview.kind === 'text') {
        return <TextPreview preview={preview} />;
    }
    if (preview.kind === 'image') {
        return (
            <div className={styles.imageWrap}>
                <img className={styles.image} src={convertFileSrc(preview.path)} alt="" />
            </div>
        );
    }
    return <NonViewable preview={preview} />;
};

const TextPreview = ({ preview }: { preview: FilePreview }) => (
    <div className={styles.textWrap}>
        <pre className={styles.text}>{preview.content ?? ''}</pre>
        {preview.truncated && <div className={styles.truncated}>--- 以下省略 ---</div>}
    </div>
);

const NonViewable = ({ preview }: { preview: FilePreview }) => (
    <div className={styles.centered}>
        <div className={styles.icon}>{NON_VIEWABLE_ICON[preview.kind as keyof typeof NON_VIEWABLE_ICON]}</div>
        <div className={styles.message}>プレビューを利用できません</div>
        <div className={styles.size}>{preview.size_formatted}</div>
    </div>
);

const Message = ({ text }: { text: string }) => (
    <div className={styles.centered}>
        <div className={styles.icon}><FileImage size={40} strokeWidth={1} color="#bbb" /></div>
        <div className={styles.message}>{text}</div>
    </div>
);
