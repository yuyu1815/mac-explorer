import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface FormattedSizeProps {
    bytes: number;
    className?: string;
}

export const FormattedSize = ({ bytes, className }: FormattedSizeProps) => {
    const [formatted, setFormatted] = useState<string>('計算中...');

    useEffect(() => {
        invoke<string>('format_size', { bytes }).then(setFormatted);
    }, [bytes]);

    return <span className={className}>{formatted}</span>;
};
