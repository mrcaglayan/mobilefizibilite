# Mobile PR 05B Limitations

PR 05B enables safe mobile editing for IK / HR staffing and employer cost inputs.

Implemented:
- IK tab renders a mobile IK editor.
- IK saves use `saveScenarioModule` and `ikSaveAdapter`.
- Editable paths are leaf-level under:
  - `ik.unitCostRatio`
  - `ik.years.y1/y2/y3.unitCosts.<role>`
  - `ik.years.y1/y2/y3.headcountsByLevel.<level>.<role>`
- Y1 unit costs are editable.
- Y2/Y3 unit costs are derived from Y1 using the same ratio/enflasyon logic as the web editor.
- Headcounts are editable for Y1/Y2/Y3.
- HQ scenarios show the `merkez` level; normal scenarios show visible local/international levels based on Temel Bilgiler kademe/program type.
- Salary expense mapping is shown read-only for Giderler compatibility.

Safety:
- The adapter expands any IK edit into full leaf patches for all three years.
- The adapter syncs legacy Y1 root fields:
  - `ik.unitCosts.<role>`
  - `ik.headcountsByLevel.<level>.<role>`
- No whole `ik`, `years`, `unitCosts`, or `headcountsByLevel` object replacement is used.
- Unknown production fields are preserved because saves patch known leaf fields into the existing inputs object.

Deferred:
- Exact dense web matrix layout.
- Detailed rule note text from the web IK editor.
- Direct editing of Y2/Y3 unit costs; web derives these from Y1 plus ratio/enflasyon.

Before PR 06A:
- Smoke test a normal scenario and an HQ scenario.
- Confirm Giderler salary-derived values still match report/web calculations after an IK save.
