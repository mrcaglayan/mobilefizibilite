# Mobile PR 06B Limitations

PR 06B ports discount editing for production `inputs.discounts`.

Safety rules kept for this PR:

- Saves go through `saveScenarioModule()` and `discountsSaveAdapter`.
- The adapter only emits leaf-field patches like `discounts.0.value`.
- It never replaces the whole `discounts` array or a whole discount row object.
- When any discount row is touched, the adapter expands the discount section into known scalar leaf patches for every normalized row.
- Existing array order is preserved. Missing default discount rows are appended only through leaf fields.
- Unknown fields on existing discount rows are preserved by the patch harness.
- Giderler expense rows remain read-only and are deferred to PR 06C.

Deferred intentionally:

- Adding or removing custom discount rows from mobile.
- Full Giderler expense editing.
- Detailed report/export parity for discount tables; that stays in PR 07.
