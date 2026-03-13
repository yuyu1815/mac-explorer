export interface DisplaySettings {
    theme: 'light' | 'dark' | 'system';
    fontSize: 'small' | 'medium' | 'large';
    defaultViewMode: 'detail' | 'icon' | 'list' | 'tiles' | 'content';
    showHiddenFiles: boolean;
    showFileExtensions: boolean;
    showItemCheckboxes: boolean;
    showDetailsPane: boolean;
    sidebarWidth: number;
}

export interface ApplicationSettings {
    language: 'ja' | 'en';
    defaultFolder: string;
    startupBehavior: 'last_folder' | 'default_folder';
    lastFolder: string | null;
    confirmTrash: boolean;
    confirmPermanentDelete: boolean;
}

export interface AppSettings {
    display: DisplaySettings;
    app: ApplicationSettings;
}

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
    theme: 'system',
    fontSize: 'medium',
    defaultViewMode: 'detail',
    showHiddenFiles: false,
    showFileExtensions: true,
    showItemCheckboxes: false,
    showDetailsPane: false,
    sidebarWidth: 200,
};

export const DEFAULT_APPLICATION_SETTINGS: ApplicationSettings = {
    language: 'ja',
    defaultFolder: '/',
    startupBehavior: 'default_folder',
    lastFolder: null,
    confirmTrash: true,
    confirmPermanentDelete: true,
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
    display: DEFAULT_DISPLAY_SETTINGS,
    app: DEFAULT_APPLICATION_SETTINGS,
};
