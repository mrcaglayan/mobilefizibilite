# Mobile PR 04C Limitations

PR 04C enables safe mobile editing for Kapasite fields through the PR 04A save harness.

Implemented:
- Editable capacity fields are patched only under `kapasite.*`.
- Saves use `saveScenarioModule`.
- Save payloads include generated `modifiedPaths` and `modifiedResources`.
- Per-kademe capacity values are saved as `kapasite.byKademe.<kademe>.caps.<period>`.
- Legacy flat rows like `kapasite.byKademe.<kademe>.<period>` are normalized into complete `caps` objects before editing, so partial `caps` objects are not created.
- When any `kapasite.byKademe.<kademe>.caps.<period>` value is dirty, the save adapter persists all four sibling caps values for that kademe.
- Derived totals are saved as field-level patches under `kapasite.totals.*`.
- Planning year totals are saved as field-level patches under `kapasite.years.y1`, `kapasite.years.y2`, and `kapasite.years.y3`.
- Current and planned student counts are read from `gradesCurrent` and `gradesYears` only for display/calculation.

Deferred:
- Editing `gradesYears`, `gradesCurrent`, or grade/branch planning.
- Grade planning remains part of PR 05A Norm Config And Grade Planning.

Safety:
- No `gradesYears`, `gradesCurrent`, or `grades` save path is enabled in PR 04C.
- Kapasite saves are blocked by the same dirty navigation guard used by Temel Bilgiler.
