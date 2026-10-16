import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import en from '../i18n/en';
import vi from '../i18n/vi';

const locales = { en, vi };

/**
 * NeuroVault — i18n Store
 * Lightweight internationalization with Zustand persistence.
 * Supports nested keys: t('sidebar.dashboard')
 */
const useI18nStore = create(
  persist(
    (set, get) => ({
      locale: 'en',
      translations: en,

      setLocale: (locale) => {
        if (locales[locale]) {
          set({ locale, translations: locales[locale] });
          document.documentElement.lang = locale;
        }
      },

      t: (key, params = {}) => {
        const { translations } = get();
        // Support nested keys: 'sidebar.dashboard'
        const value = key.split('.').reduce((obj, k) => obj?.[k], translations);
        if (typeof value !== 'string') return key;
        // Replace {{param}} placeholders
        return value.replace(/\{\{(\w+)\}\}/g, (_, k) => params[k] ?? `{{${k}}}`);
      },

      availableLocales: [
        { code: 'en', label: 'English', flag: '🇺🇸' },
        { code: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' },
      ],
    }),
    {
      name: 'neurovault-i18n',
      partialize: (state) => ({ locale: state.locale }),
      onRehydrate: () => (state) => {
        if (state?.locale && locales[state.locale]) {
          state.translations = locales[state.locale];
          document.documentElement.lang = state.locale;
        }
      },
    }
  )
);

export default useI18nStore;
