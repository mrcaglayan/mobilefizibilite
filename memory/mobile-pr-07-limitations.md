# PR 07 Limitations

PR 07 makes mobile report review useful without changing scenario input save flows.

Implemented:
- Original report review with KPI cards, 3-year summary, income breakdown, expense breakdown, and report warnings.
- Detailed report review with one-page and detailed modes based on the backend report result payload.
- USD/local display switch when the scenario has valid local currency metadata.
- Distributed report mode is read-only and shown only when distribution metadata or scenario metadata indicates it exists.
- Report tabs include a real `Hesapla` action through `calculateScenario`; plain reload remains cache/read-only.
- After mobile input saves, report tabs require `Hesapla` before loading report data again to avoid showing stale backend cache.
- Authenticated XLSX/PDF download uses the existing backend export route and native/web file sharing where supported.

Deferred:
- Creating, applying, or reverting expense distributions. This remains PR 08.
- Full web pixel parity for every detailed report table.
- Admin rollup reports. This remains PR 09.
