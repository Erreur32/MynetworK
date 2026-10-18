# unifi-device-card (vendored)

Source: https://github.com/bluenazgul/unifi-device-card (MIT, see LICENSE).
Copied from the `src/` directory of the upstream repository.

Local changes (everything else is untouched upstream code):

- `mynetwork-adapter.js` (new): builds the device context and a synthetic `hass.states` from MyNetwork UniFi devices instead of Home Assistant entities.
- `helpers.js`: `buildDeviceContext` delegates `mn:` device ids to the adapter.
- `unifi-device-card.js`: front panel background reads `--udc-panel-bg` (theming); the initial port selection prefers the real uplink (`ctx.uplink_port` detected by the adapter, or the `uplink_port` config); port RX/TX are shown as bit/s, kbit/s, Mbit/s, Gbit/s (`_formatRate`); `VERSION` is a constant (no build-time define); ports with live traffic get a `has-traffic` class and a faster LED blink (`port_led_traffic_blink_speed`).

Excluded from SonarCloud (`sonar.exclusions`).
