# Server-side messages and multilingual support

## Policy

All user-facing messages returned by the server (API responses, error messages, notification titles/bodies) are in **English**. This ensures:

- A single, consistent language for the API
- The client can rely on stable message content for mapping to translation keys
- Logs and API consumers see a uniform language

## What was changed

French strings in the following server files were replaced with English:

| File | Changes |
|------|---------|
| `server/plugins/unifi/UniFiApiService.ts` | UniFi connection error messages (ECONNREFUSED, ENOTFOUND, SSL, timeout, network) |
| `server/plugins/scan-reseau/ScanReseauPlugin.ts` | Plugin display name "Scan Réseau" → "Network scan", error message, file comment |
| `server/routes/dashboard.ts` | Freebox DHCP detail "Indisponible" → "Unavailable" |
| `server/routes/network-scan.ts` | Add IP / rescan success messages (e.g. "IP ajoutée et scannée avec succès" → "IP added and scanned successfully") |
| `server/routes/wifi.ts` | WPS permission and error messages |
| `server/routes/speedtest.ts` | Ping/bandwidth/speedtest error messages |
| `server/routes/vm.ts` | No disk / disk check error messages |
| `server/services/securityNotificationService.ts` | All notification titles and messages (login failed/success, blocked, IP blocked/unblocked, password changed, security settings, user created/deleted/enabled/disabled, JWT warning) |

## Client translation of server messages

When the client displays an error or message that comes from the API:

1. If the response includes an **error code** (e.g. `error.code === 'connection_closed'`), use the corresponding translation key: `t('server.connection_closed')`. The keys are defined in `src/locales/en.json` and `src/locales/fr.json` under the `server` namespace.
2. If there is no code or no matching key, fall back to displaying `error.message` (which is in English).

Example:

```ts
const errorMessage = error?.code && t(`server.${error.code}`) ? t(`server.${error.code}`) : (error?.message ?? t('common.error'));
```

## Adding new server messages

When adding new user-facing messages on the server:

1. Prefer returning a **code** in the error/result object (e.g. `code: 'my_new_error'`) and a short English **message** for logs and fallback.
2. Add the key to both client locale files, e.g. `server.my_new_error` in `en.json` and `fr.json`.
3. In the client, when displaying the error, use `t('server.my_new_error')` when the code is present.
