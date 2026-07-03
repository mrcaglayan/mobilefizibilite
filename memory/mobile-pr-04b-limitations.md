# Mobile PR 04B Limitations

PR 04B enables safe mobile editing for Temel Bilgiler fields through the PR 04A save harness.

Implemented:
- Editable Temel Bilgiler fields are patched only under `temelBilgiler.*`.
- Saves use `saveScenarioModule`.
- Save payloads include generated `modifiedPaths` and `modifiedResources`.
- Other scenario modules remain read-only.
- Tab switching, pull-to-refresh, footer refresh, and the visible back button are blocked while unsaved Temel Bilgiler edits exist.
- Android hardware back, React Navigation route removal, and browser unload are also blocked/warned while unsaved Temel Bilgiler edits exist.

Deferred:
- Previous-year planned performance comparison values from the web editor.
- Currency conversion warnings that depend on previous scenario/report metadata.
- Capacity, gradesCurrent, IK-derived read-only summaries from the web editor.
- Section-level Temel Bilgiler edit affordances for users who have only `section.temel_bilgiler.*` write permissions.

Current permission behavior:
- Mobile PR 04B enables editing when the active Temel Bilgiler module is writable at the module level.
- The backend save payload is still section-aware because dirty paths are mapped to `modifiedResources`.

Before expanding Gelirler, Giderler, Norm, IK, or Kapasite saves, add or verify guards against whole row/item/year object replacement.
