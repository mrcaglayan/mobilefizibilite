# Mobile PR 08 Limitations

PR 08 adds mobile operational flows for expense distribution, bulk scenario send, and country approval batch send.

Implemented safety behavior:
- Expense distribution apply requires a preview first.
- Expense distribution apply and revert require explicit confirmation.
- Bulk send loads a preview before any send action.
- Country batch send requires a preview before any send action.
- Bulk send and country batch send block when backend stale-distribution guards are present.
- Stale source rows are shown in warning cards instead of being silently bypassed.

Known limitations:
- The mobile UI is workflow-parity focused and does not attempt to copy the web modal layout exactly.
- Expense distribution target and pool previews show a compact subset of rows on mobile.
- Revert uses the backend's latest distribution scope and requires confirmation; there is no separate backend revert-preview endpoint.
- Manual QA should verify preview/apply/revert with test scenarios before using the flow on important production data.

Manual smoke before closing:
- Preview and apply expense distribution for one source scenario and at least one target scenario.
- Revert the same distribution after confirmation.
- Confirm bulk send blocks when stale distribution sources are returned by the backend.
- Confirm country batch send blocks when stale distribution sources are returned by the backend.
- Confirm successful bulk/country send refreshes the list state.
