# Mobile PR 05A Limitations

PR 05A enables safe mobile editing for Norm Config and grade planning.

Implemented:
- Norm tab renders a mobile Norm editor.
- Grade planning edits save through `saveScenarioModule` and `normGradesSaveAdapter`.
- Grade patches are leaf-level under:
  - `gradesYears.y1/y2/y3.<index>.grade`
  - `gradesYears.y1/y2/y3.<index>.branchCount`
  - `gradesYears.y1/y2/y3.<index>.studentsPerBranch`
  - `gradesCurrent.<index>.grade`
  - `gradesCurrent.<index>.branchCount`
  - `gradesCurrent.<index>.studentsPerBranch`
- Any touched planning year is expanded to all rows and all three leaf fields, so partial `gradesYears.<year>` arrays are not created.
- Any touched current-grade row expands `gradesCurrent` to all rows and all three leaf fields, so partial current-grade arrays are not created.
- Any touched `gradesYears.y1` save also syncs the full legacy `grades` array as leaf-field patches.
- Planning-grade initialization matches web fallback behavior: `gradesYears.y1` falls back to legacy `grades`, `y2` falls back to `y1`, and `y3` falls back to `y1`.
- Norm config saves use `/schools/:schoolId/norm-config?scenarioId=:scenarioId`.
- Teacher weekly max hours and curriculum weekly hour cells are editable when the user has `page.norm:write`.
- Grade planning remains editable with the Norm work-item write permission.

Safety:
- The shared save harness still blocks object/array patch values by default.
- Grade input saves do not replace whole `gradesYears`, `gradesCurrent`, year arrays, or row objects; full arrays are represented as leaf-field patches.
- Legacy `grades` is kept in sync with Y1 grade planning for web/report modules that still read it.
- Scenario input grade changes are saved before norm config changes, matching the web flow.
- Norm config and grade inputs are saved through separate backend contracts because the production backend exposes them separately.

Deferred:
- Full web parity for lesson rename workflows.
- Full mobile table density of the web Norm matrix.
- Advanced visual grouping by kademe inside the curriculum matrix.
- Bulk curriculum row copy/delete review beyond the current add/remove row controls.

Before PR 05B:
- Smoke test PR 05A with a user who has `page.norm:write`.
- Smoke test grade-only editing with a section-level Norm writer if such a user exists.
