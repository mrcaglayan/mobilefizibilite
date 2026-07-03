# Mobile PR 06A Limitations

PR 06A ports the Gelirler editor for the production income input shape:

- `gelirler.tuition.rows`
- `gelirler.nonEducationFees.rows`
- `gelirler.dormitory.rows`
- `gelirler.otherInstitutionIncome.rows`
- `gelirler.governmentIncentives`

Safety rules kept for this PR:

- Saves go through `saveScenarioModule()` and `gelirlerSaveAdapter`.
- The adapter only emits leaf-field patches.
- It never replaces a whole row object or a whole `rows` array.
- When one row in a section is touched, the adapter expands that section to leaf patches for every row in the section. This prevents partial `rows` arrays from being created on legacy/default-backed data.
- Unknown fields already present on production rows are preserved by the patch harness.

Deferred intentionally:

- Adding/removing/customizing income rows.
- Editing Discounts/Burs/Indirim rows; that stays in PR 06B.
- Advanced web table parity and export formatting; report/export parity stays in PR 07.
