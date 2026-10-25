# SONIX network weathermap

Run `npm run dev` and open http://localhost:5173. No installation or build step is needed.

A geographically schematic Stockholm network map with separate circuit lanes, a circuit inventory, site and circuit inspection, search by district/device/port, capacity-relative utilization, zoom, fullscreen, JSON export and an illustrative history player. Keyboard: `/` focuses search, Escape clears search/site focus, Enter or Space selects stations/circuits.

## Data provenance

`dist/data/grafana-dashboard.json` preserves the supplied definition, including MetricsQL bindings. `dist/data/topology.json` extracts its seven switches, eleven paired circuits, two unpaired interfaces, port labels and capacities. Throughput and availability are transcribed from the supplied screenshots, not live measurements. Reachability is based on the screenshot's switch styling. Charts and replay values are explicitly illustrative and are not measured history. No period traffic totals are invented. Circuit sum counts traffic across links and is not exchange throughput.

Geography follows user-provided districts: North Kista (IXN), Kista (KG), Bromma (SK1), Östermalm (KN7, with CH a few blocks north), Årsta (RL), Sköndal (SK2). Routes and distances are schematic, not fiber routing. Crossings without station squares are not junctions. Unpaired Obe L2VPN interfaces remain independent.

## Connecting real telemetry

The original dashboard queries are in the preserved definition. A production adapter should query VictoriaMetrics server-side, resolve the `LINK nn A to B`, `LINK nn B to A`, node reachability and endpoint carrier bindings, and return timestamped values. Convert bits/s to Gb/s before setting `tx` and `rx`. Preserve missing/unknown state separately from zero throughput and operational-down state. Use actual range-query samples for charts/replay; compute period totals from counters rather than these illustrative curves. Keep credentials server-side and display sample freshness. The supplied export identifies a datasource UID but contains no backend URL or credentials, so this prototype has no live connection.
