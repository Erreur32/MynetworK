# Internationalization (i18n)

The application is fully internationalized with **English as the default language** and **French** as a second language.

## Overview

- **Default language:** English
- **Supported languages:** `en`, `fr`
- **Persistence:** User language choice is stored in `localStorage` under the key `mynetwork_lang`
- **Switcher:** EN/FR toggle is available in the header (next to the user menu)

## Implementation

- **Stack:** `i18next`, `react-i18next`, `i18next-browser-languagedetector`
- **Config:** `src/i18n/index.ts` — initializes i18n with fallback `en`, loads `en` and `fr` from `src/locales/`
- **Translation files:** `src/locales/en.json`, `src/locales/fr.json` — flat namespaced keys (e.g. `common.loading`, `nav.dashboard`)

## Usage in code

```tsx
import { useTranslation } from 'react-i18next';

const MyComponent = () => {
  const { t } = useTranslation();
  return <span>{t('common.loading')}</span>;
};
```

With interpolation:

```tsx
t('dashboard.showAllDevices', { count: 42 })
t('theme.parametersAnimation', { name: getCurrentAnimationName() })
```

## Adding new strings

1. Add the key and value to both `src/locales/en.json` and `src/locales/fr.json` (same key, translated value in each).
2. Use `t('namespace.key')` in the component.

## Documentation and project files

- **README.md** and **CHANGELOG.md** are in English, with a French README at **README.fr.md**.
- **Docs/** – Main guides are in **English** (default); key docs have a **French** version (`.fr.md`). See [Docs/README.md](README.md) for the list. Technical docs (e.g. INTERNATIONALIZATION.md, SERVER_I18N.md) remain in English only.

## Server (API) and multilingual support

- **API messages:** All user-facing messages returned by the **server** (in `server/`) are in **English**. This keeps the API language-consistent and avoids mixing languages in responses.
- **Client-side translation of API errors:** When the client displays an error from the API, it can translate known error **codes** using the `server.*` keys in the locale files. Example: if the API returns `error.code === 'connection_closed'`, the client can show `t('server.connection_closed')` so the user sees the message in their selected language (EN/FR).
- **Locale keys for server:** The namespaces `server.connection_closed`, `server.ping_timeout`, `server.wps_error`, `server.no_disk`, `server.ip_added_ok`, etc. exist in both `en.json` and `fr.json`. Use them when displaying API errors that include a known `code` field.

## Code comments

All code comments in the repository should be in **English** for consistency and to allow any developer to understand the codebase.
