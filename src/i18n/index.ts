/**
 * i18n configuration for the application.
 * Default language: English. Supported: en, fr.
 * Language is persisted in localStorage and can be switched via the UI.
 *
 * Translation files are split by namespace under src/locales/{lang}/.
 * Each file is imported and merged into a single "translation" namespace
 * so existing t('section.key') calls work without changes.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// --- FR imports ---
import frCommon from '../locales/fr/common.json';
import frNetwork from '../locales/fr/network.json';
import frNetworkScan from '../locales/fr/networkScan.json';
import frPlugins from '../locales/fr/plugins.json';
import frSettings from '../locales/fr/settings.json';
import frAdmin from '../locales/fr/admin.json';
import frTheme from '../locales/fr/theme.json';
import frUnifi from '../locales/fr/unifi.json';
import frUnifiPage from '../locales/fr/unifiPage.json';
import frDashboard from '../locales/fr/dashboard.json';
import frUserMenu from '../locales/fr/userMenu.json';
import frFreebox from '../locales/fr/freebox.json';
import frFreeboxPage from '../locales/fr/freeboxPage.json';
import frSystem from '../locales/fr/system.json';
import frServer from '../locales/fr/server.json';
import frPluginSummary from '../locales/fr/pluginSummary.json';
import frTv from '../locales/fr/tv.json';
import frPhone from '../locales/fr/phone.json';
import frVms from '../locales/fr/vms.json';
import frFiles from '../locales/fr/files.json';
import frAnalytics from '../locales/fr/analytics.json';

// --- EN imports ---
import enCommon from '../locales/en/common.json';
import enNetwork from '../locales/en/network.json';
import enNetworkScan from '../locales/en/networkScan.json';
import enPlugins from '../locales/en/plugins.json';
import enSettings from '../locales/en/settings.json';
import enAdmin from '../locales/en/admin.json';
import enTheme from '../locales/en/theme.json';
import enUnifi from '../locales/en/unifi.json';
import enUnifiPage from '../locales/en/unifiPage.json';
import enDashboard from '../locales/en/dashboard.json';
import enUserMenu from '../locales/en/userMenu.json';
import enFreebox from '../locales/en/freebox.json';
import enFreeboxPage from '../locales/en/freeboxPage.json';
import enSystem from '../locales/en/system.json';
import enServer from '../locales/en/server.json';
import enPluginSummary from '../locales/en/pluginSummary.json';
import enTv from '../locales/en/tv.json';
import enPhone from '../locales/en/phone.json';
import enVms from '../locales/en/vms.json';
import enFiles from '../locales/en/files.json';
import enAnalytics from '../locales/en/analytics.json';

// Merge all namespace files into a single translation object per language.
// unifi: merge unifi.json + unifiPage.json. freebox: merge freebox.json + freeboxPage.json.
const fr = {
    ...frCommon, ...frNetwork, ...frNetworkScan, ...frPlugins, ...frSettings,
    ...frAdmin, ...frTheme, ...frDashboard, ...frUserMenu,
    ...frSystem, ...frServer, ...frPluginSummary,
    unifi: { ...(frUnifi.unifi ?? {}), ...(frUnifiPage?.unifi ?? {}) },
    freebox: { ...(frFreebox.freebox ?? {}), ...(frFreeboxPage?.freebox ?? {}) },
    tv: { ...(frTv?.tv ?? {}) },
    phone: { ...(frPhone?.phone ?? {}) },
    vms: { ...(frVms?.vms ?? {}) },
    files: { ...(frFiles?.files ?? {}) },
    analytics: { ...(frAnalytics?.analytics ?? {}) }
};

const en = {
    ...enCommon, ...enNetwork, ...enNetworkScan, ...enPlugins, ...enSettings,
    ...enAdmin, ...enTheme, ...enDashboard, ...enUserMenu,
    ...enSystem, ...enServer, ...enPluginSummary,
    unifi: { ...(enUnifi.unifi ?? {}), ...(enUnifiPage?.unifi ?? {}) },
    freebox: { ...(enFreebox.freebox ?? {}), ...(enFreeboxPage?.freebox ?? {}) },
    tv: { ...(enTv?.tv ?? {}) },
    phone: { ...(enPhone?.phone ?? {}) },
    vms: { ...(enVms?.vms ?? {}) },
    files: { ...(enFiles?.files ?? {}) },
    analytics: { ...(enAnalytics?.analytics ?? {}) }
};

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
