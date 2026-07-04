# PR 06C Limitations

PR 06C ports the mobile Giderler editor with production-data safety first.

Implemented:
- `giderler.isletme.items.*` editable for non-HR operating rows.
- `giderler.ogrenimDisi.items.*.unitCost` editable.
- `giderler.yurt.items.*.unitCost` editable.
- HR-derived operating rows remain read-only and are displayed from IK-derived salary data.
- Service and dorm student counts remain read-only and are derived from Gelirler rows.
- Saves use leaf-field patches only through the scenario save harness.
- Touched expense sections expand to known scalar leaf patches; rows/objects/arrays are not replaced.

Deferred:
- Adding, deleting, or reordering expense rows.
- Editing HR-derived salary expense rows directly from Giderler.
- Native detailed report reconciliation after calculation; PR 07 covers report UI parity.
- Expense distribution workflows; PR 08 covers distribution apply/revert flows.
