export const StatusBar = () => {
    return (
        <div style={{
            height: 'var(--statusbar-height)',
            borderTop: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-main)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 16px',
            fontSize: '12px',
            color: 'var(--text-muted)'
        }}>
            <div>0 個の項目</div>
        </div>
    );
};
