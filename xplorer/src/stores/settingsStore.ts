import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { AppSettings, DisplaySettings, ApplicationSettings, DEFAULT_APP_SETTINGS } from '@/types';

interface SettingsState {
    settings: AppSettings;
    loaded: boolean;
    settingsOpen: boolean;

    loadSettings: () => Promise<void>;
    openSettings: () => void;
    closeSettings: () => void;
    updateDisplaySettings: (settings: Partial<DisplaySettings>) => Promise<void>;
    updateAppSettings: (settings: Partial<ApplicationSettings>) => Promise<void>;
    setTheme: (theme: DisplaySettings['theme']) => Promise<void>;
    setFontSize: (fontSize: DisplaySettings['fontSize']) => Promise<void>;
    setDefaultViewMode: (mode: DisplaySettings['defaultViewMode']) => Promise<void>;
    setShowHiddenFiles: (show: boolean) => Promise<void>;
    setShowFileExtensions: (show: boolean) => Promise<void>;
    setShowItemCheckboxes: (show: boolean) => Promise<void>;
    setShowDetailsPane: (show: boolean) => Promise<void>;
    setSidebarWidth: (width: number) => Promise<void>;
    setLanguage: (language: ApplicationSettings['language']) => Promise<void>;
    setDefaultFolder: (folder: string) => Promise<void>;
    setStartupBehavior: (behavior: ApplicationSettings['startupBehavior']) => Promise<void>;
    setLastFolder: (folder: string | null) => Promise<void>;
    setConfirmTrash: (confirm: boolean) => Promise<void>;
    setConfirmPermanentDelete: (confirm: boolean) => Promise<void>;
}

const saveSettings = async (settings: AppSettings): Promise<void> => {
    await invoke('save_settings', { settings });
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
    settings: DEFAULT_APP_SETTINGS,
    loaded: false,
    settingsOpen: false,

    loadSettings: async () => {
        try {
            const settings = await invoke<AppSettings>('load_settings');
            set({ settings, loaded: true });
        } catch {
            set({ settings: DEFAULT_APP_SETTINGS, loaded: true });
        }
    },

    openSettings: () => set({ settingsOpen: true }),
    closeSettings: () => set({ settingsOpen: false }),

    updateDisplaySettings: async (updates) => {
        const { settings } = get();
        const newSettings = {
            ...settings,
            display: { ...settings.display, ...updates },
        };
        set({ settings: newSettings });
        await saveSettings(newSettings);
    },

    updateAppSettings: async (updates) => {
        const { settings } = get();
        const newSettings = {
            ...settings,
            app: { ...settings.app, ...updates },
        };
        set({ settings: newSettings });
        await saveSettings(newSettings);
    },

    setTheme: async (theme) => {
        await get().updateDisplaySettings({ theme });
    },

    setFontSize: async (fontSize) => {
        await get().updateDisplaySettings({ fontSize });
    },

    setDefaultViewMode: async (defaultViewMode) => {
        await get().updateDisplaySettings({ defaultViewMode });
    },

    setShowHiddenFiles: async (showHiddenFiles) => {
        await get().updateDisplaySettings({ showHiddenFiles });
    },

    setShowFileExtensions: async (showFileExtensions) => {
        await get().updateDisplaySettings({ showFileExtensions });
    },

    setShowItemCheckboxes: async (showItemCheckboxes) => {
        await get().updateDisplaySettings({ showItemCheckboxes });
    },

    setShowDetailsPane: async (showDetailsPane) => {
        await get().updateDisplaySettings({ showDetailsPane });
    },

    setSidebarWidth: async (sidebarWidth) => {
        await get().updateDisplaySettings({ sidebarWidth });
    },

    setLanguage: async (language) => {
        await get().updateAppSettings({ language });
    },

    setDefaultFolder: async (defaultFolder) => {
        await get().updateAppSettings({ defaultFolder });
    },

    setStartupBehavior: async (startupBehavior) => {
        await get().updateAppSettings({ startupBehavior });
    },

    setLastFolder: async (lastFolder) => {
        await get().updateAppSettings({ lastFolder });
    },

    setConfirmTrash: async (confirmTrash) => {
        await get().updateAppSettings({ confirmTrash });
    },

    setConfirmPermanentDelete: async (confirmPermanentDelete) => {
        await get().updateAppSettings({ confirmPermanentDelete });
    },
}));
