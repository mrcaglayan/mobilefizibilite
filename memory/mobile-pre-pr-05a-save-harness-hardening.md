# Mobile Pre-PR 05A Save Harness Hardening

Before PR 05A enables Norm Config and grade planning saves, the shared module save harness now blocks object/array replacement by default.

Implemented:
- Adapters still must declare `allowedPathPrefixes`.
- Whole collection root replacement remains blocked unless `allowWholeCollectionReplace` is explicitly enabled.
- Any patch whose value is an object or array is blocked unless `allowStructuredValueReplace` is explicitly enabled.
- Current Temel Bilgiler and Kapasite editors continue to save leaf scalar fields only.

Reason:
- Grade/norm data can contain arrays and nested row objects with unknown production fields.
- Replacing `gradesYears.y1`, `gradesYears.y1.0`, `gradesCurrent.0`, `rows.0`, or similar object/array values can silently drop unknown fields.
- PR 05A adapters should patch leaf fields, or explicitly document and opt into structured replacement only after proving unknown fields are preserved.

Next:
- Start PR 05A only after confirming Norm/grade adapter patches are leaf-level or have a reviewed structured replacement strategy.
