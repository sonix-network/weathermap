# SONIX network weathermap

Hosted at https://sonix-network.github.io/weathermap/. Changes pushed to `main` are tested and deployed automatically by GitHub Actions. The Pages artifact contains only `dist/`.

Run `npm run dev`, then open http://localhost:5173. No install or build is required. `npm run check` runs syntax checks and telemetry tests.

## Live browser connection

The dashboard defaults to `https://victoria.local.sonix.network/prometheus` and queries `/api/v1/query` and `/api/v1/query_range` directly from the visitor's browser. There is no backend proxy and no service credential. Click the connection indicator to edit the URL, sign in to SONIX in a separate tab, and retry. Only the URL and cookie-mode preference are stored in localStorage. Queries include the visitor's existing SONIX cookie by default. The optional cookie checkbox can be disabled for an unauthenticated Prometheus-compatible source.

The query URL accepts a base, instant-query URL, or range-query URL; cluster/tenant path prefixes are preserved. The app discovers either the short `instance` labels from the export or the fully qualified `.sonix.network:9100` labels used by the public SONIX API. It only queries switches and exact physical interfaces from the supplied topology.

### Browser access requirements

The browser must be able to reach the VictoriaMetrics host and have a valid SONIX session. Cross-origin reads require these response headers from the VictoriaMetrics/auth gateway (including failures):

```
Access-Control-Allow-Origin: https://sonix-network.github.io
Access-Control-Allow-Credentials: true
Vary: Origin
```

Use the exact trusted dashboard origin, not `*`, when cookies are enabled. The `/weathermap/` path is not part of the origin. The earlier Sites preview uses `https://sonix-fabric-weathermap.magichippo17.chatgpt.site`; allow that separately only if it remains in use. A browser serving the local checkout needs its exact localhost origin permitted too. Requests are simple GETs with an `Accept: application/json` header, so they do not intentionally require a preflight. Long fixed queries are split into bounded URLs with no more than three concurrent requests per query operation.

If SONIX cookies use `SameSite=Lax`/`Strict`, or the browser blocks third-party cookies, cross-site session cookies will not be sent from a `github.io` or `chatgpt.site` page. The simplest deployment for session-driven access is to serve `dist/` from the VictoriaMetrics origin (for example `/weathermap/`), which avoids both CORS and third-party cookie requirements. A same-site SONIX host can also work with the appropriate cookie domain and CORS policy. The dashboard does not bypass authentication, change cookie security policy, or store/copy session tokens.

The private endpoint redirected an unauthenticated API request to SONIX's GitHub sign-in during development. Its authenticated session/CORS combination cannot be confirmed without the user's browser session. Public SONIX metrics at `https://metric.sonix.network` were used to validate actual query names, throughput, measured history, optics, and errors. That public source supports `Access-Control-Allow-Origin: *` and must be used with the cookie checkbox OFF. The app does not silently fall back to that source.

## Traffic and history

- Polls live five-minute ASIC counter rates and carrier/exporter state every 30 seconds while visible. Traffic is converted from bytes/s to Gb/s.
- 1h, 6h and 24h range queries produce measured charts and replay values on an aligned grid, with roughly 60–240 intervals. The history player uses recorded samples. Selecting Live returns to the latest instant query.
- Readings older than 180 seconds at their evaluation time are unknown. Missing values, stale timestamps, query failures, and zero throughput remain distinct. Charts break at gaps.
- Source failures produce a sign-in/retry/settings notice and clear current readings. No screenshot values or synthetic curves are used.
- Traffic sum counts circuit hops, not exchange throughput. Partial coverage is labelled. Each parallel circuit remains separate; unpaired interfaces query only their known local endpoint. Their RX labels represent traffic arriving from the unconfirmed far end at the local port.

## Optics and errors

The circuit inspector has Traffic, Optics, and Errors tabs for both endpoint ports.

Optics query `sfp_eeprom_value` and retain the exporter `property`, `unit`, and `active` labels. RX/TX lane powers, temperature, and laser bias display in the reported units. The UI shows module-exported alarm/warning thresholds and checks matching-unit power/temperature readings against them; inactive lanes are marked inactive. RX/TX dBm range-query histories are charted by lane. Replay shows measured lane power and does not claim historical alarm status from live thresholds. No universal optical threshold or conversion is assumed.

Errors include RX/TX errored packets and discards, FEC corrected/uncorrectable frames, and FEC symbol errors. Rates use `rate(...[5m])`; last-1h/6h/24h totals use counter-reset-aware `increase`. Totals remain fixed while replaying, and their end timestamp is shown. Corrected FEC is not reported as packet loss. Unexported counters show an em dash, not zero.

Metric mappings live in `dist/metrics.js`. They were verified against the SONIX exporter through the public metrics API. The VictoriaMetrics data source must scrape the same names/labels for those diagnostics to appear.

## Geography and source

Stockholm schematic: North Kista (IXN), Kista (KG), Bromma (SK1), Östermalm (KN7, CH a few blocks north), Årsta (RL), Sköndal (SK2). Routes and distances are schematic, not fiber routing. Crossings without station squares are not junctions. Unpaired Obe L2VPN interfaces remain independent.

`dist/data/grafana-dashboard.json` preserves the supplied definition. `dist/data/topology.json` contains its seven switches, eleven paired circuits, two unpaired interfaces, capacities, port labels and exact Ethernet interface mappings. Snapshot measurements have been removed from runtime topology.

Keyboard: `/` focuses search; Escape clears search/site focus; Enter or Space selects map stations/circuits. JSON export contains the currently displayed measured snapshot and source URL.

API reference: https://docs.victoriametrics.com/victoriametrics/url-examples/

## SONIX branding

The header uses the supplied identity package’s white wordmark (`Png/SONIX FINAL 3.png`), and the sidebar uses its transparent blue swirl (`Logo-Trans-Small.png`). These originals are copied unchanged into `dist/assets/` as `sonix-wordmark-white.png` and `sonix-symbol-blue.png`. The earlier website logo and favicon are from https://sonix.network/img/logo.svg and https://sonix.network/img/favicon.ico. The interface uses SONIX blue (`#006aa7`), navy surfaces, and the website’s Space Grotesk / Source Sans 3 typography. Traffic utilization, down-state, and warning colours retain their operational meaning.

## Map-first layout

The topology occupies the first viewport, with a narrow circuit inspector beside it (roughly 85% map and 10% inspector, plus navigation). Summary cards and traffic replay sit below the map. The inspector expands over the map when detailed tables need more width. On small screens it becomes a compact bottom strip with an expandable detail drawer.

### Pomerium example for GitHub Pages

Keep the existing user allowlist and add route-level CORS response headers:

```yaml
- from: https://victoria.local.sonix.network
  to: http://[2a0a:d980:1981::1d]:8428
  allowed_users: *sonix_admins
  cors_allow_preflight: true
  set_response_headers:
    Access-Control-Allow-Origin: "https://sonix-network.github.io"
    Access-Control-Allow-Credentials: "true"
    Access-Control-Allow-Methods: "GET, OPTIONS"
    Access-Control-Allow-Headers: "Accept, Content-Type"
    Vary: "Origin"
```

For the current cookie-based client on `github.io`, Pomerium also needs `cookie_same_site: "None"` at the **top level**, outside the route list, so its HTTPS session cookie can accompany cross-site fetches. This setting applies globally. Sign in again after changing it so the cookie is reissued. Browser third-party-cookie blocking may still prevent access; hosting under the SONIX site avoids that dependency.

References: https://www.pomerium.com/docs/internals/troubleshooting and https://www.pomerium.com/docs/reference/cookies .
