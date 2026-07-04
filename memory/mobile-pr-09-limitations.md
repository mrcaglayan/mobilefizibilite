# Mobile PR 09 Limitations

PR 09 adds focused admin mobile coverage for:
- `/admin/progress`
- `/admin/reports`
- `/admin/manage-permissions`
- admin user permission editing
- school principal/HR/accountant assignment management through `/admin/schools/[id]/assignments`

Implemented behavior:
- Admin dashboard links route to the new progress, reports, and permissions screens.
- Progress requirements can be edited per country at section level.
- Progress requirements can be copied to selected countries after confirmation.
- Existing progress `selectedFields` data is preserved when section settings are edited.
- Admin rollup reports can be loaded by academic year.
- User permissions can be edited with read/write actions and country/school scopes.
- School assignments can replace principal/HR/accountant module responsibilities after confirmation.

Known limitations:
- Progress field-level include/exclude editing is not exposed in mobile yet; mobile preserves existing field-level config.
- The admin reports screen is a compact rollup viewer, not full web table parity.
- Rollup XLSX export is disabled in mobile because `/admin/reports/rollup.xlsx` is a backend 501 stub.
- Clearing a user's country assignment is not exposed because the backend requires a valid `country_id` or `country_code`.
- Principal-only management is consolidated into the assignments screen; `/admin/schools/[id]/principals` redirects there.
- Assignment save replaces the backend assignment list for the school, matching the backend route behavior.

Manual smoke before closing:
- Open `/admin/progress`, edit one section mode/min setting, save, refresh, and confirm it persists.
- Use progress bulk apply on a non-critical country after confirmation.
- Open `/admin/reports`, load a valid academic year, inspect totals, and confirm XLSX is shown as unavailable.
- Open `/admin/manage-permissions`, select a user, edit a scoped permission, save, and refresh.
- Open a country school from `/admin/countries`, tap `ATAMA`, add/edit/remove an assignment, save after confirmation, and refresh.
