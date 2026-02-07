/**
 * i18n configuration for the application.
 * Default language: English. Supported: en, fr.
 * Language is persisted in localStorage and can be switched via the UI.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from '../locales/en.json';
import fr from '../locales/fr.json';

const resources = {
    en: { translation: en },
    fr: { translation: fr }
};

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources,
        fallbackLng: 'en',
        lng: 'en',
        supportedLngs: ['en', 'fr'],
        interpolation: {
            escapeValue: false
        },
        detection: {
            order: ['localStorage'],
            caches: ['localStorage'],
            lookupLocalStorage: 'mynetwork_lang'
        }
    });

export default i18n;
