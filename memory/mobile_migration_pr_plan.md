# Mobile Migration PR Plan

## Goal
Port the production `fizibilite` web application into the Expo mobile app in a controlled sequence. The mobile app must use the same production Node/Express/MySQL backend at `tmffinance.com`; the FastAPI demo backend is only a local preview aid.

## Current Inventory

### Web App Source Of Truth
- Frontend root: `fizibilite/frontend/src`
- Backend root: `fizibilite/backend/src`
- Main web routes:
  - `/login`
  - `/profile`
  - `/schools`
  - `/select`
  - `/schools/:id`
  - `/schools/:id/temel-bilgiler`
  - `/schools/:id/kapasite`
  - `/schools/:id/norm`
  - `/schools/:id/ik`
  - `/schools/:id/gelirler`
  - `/schools/:id/giderler`
  - `/schools/:id/detayli-rapor`
  - `/schools/:id/rapor`
  - `/users`
  - `/countries`
  - `/progress`
  - `/approvals`
  - `/reports`
  - `/manage-permissions`
  - `/review-queue`

### Mobile App Current Surface
- Expo root: `frontend`
- Implemented mobile routes:
  - `/login`
  - `/schools`
  - `/school/[id]`
  - `/scenario/[schoolId]/[scenarioId]`
  - `/admin/users`
  - `/admin/user/[id]`
  - `/admin/countries`
  - `/admin/country/[id]`
  - `/admin/approvals`
  - `/manager/users`
  - `/manager/user/[id]`
- Current mobile editor is an MVP editor, not a full port of the web scenario modules.

### Important Real-Backend Compatibility Notes
- Real backend returns some list endpoints as raw arrays or named arrays such as `{ schools }`, `{ scenarios }`, `{ users }`; mobile must not assume only `{ items }`.
- Real backend uses numeric IDs; mobile must treat IDs as `string | number` and stringify route/list keys.
- Real backend CORS currently allows `http://localhost:3000`. Browser web testing should run Expo web on port `3000`; native Expo Go/device builds are not blocked by browser CORS.
- `tmffinance.com` API is the source of truth. Do not add new mobile-only backend behavior unless the production backend is missing an essential endpoint.

## Cross-PR Rules
- Keep each PR shippable and testable against `http://tmffinance.com`.
- Use `fizibilite/frontend/src/api.js` as the API contract reference before adding or changing mobile API calls.
- Prefer response normalizers in `frontend/src/api/client.ts` over screen-local shape guesses.
- For every role-sensitive screen, test at least: `admin`, `manager`, `accountant`, `principal`, `hr`, and a regular `user` if credentials exist.
- Do not port web CSS/layout literally. Port workflow, data contract, validation, permissions, and domain behavior into mobile-native UI.
- Keep the FastAPI demo backend in sync only for flows needed for offline/demo preview; production parity has priority.
- Every PR should pass:
  - `cd frontend && corepack yarn tsc --noEmit`
  - `cd frontend && corepack yarn lint`
  - manual smoke on `http://localhost:3000` against `tmffinance.com`

## PR 00 - Real Backend Contract Baseline

Branch: `mobile/pr-00-real-backend-contract`

Purpose: Make the existing mobile app reliable against production API shapes before adding new features.

Scope:
- Expand `frontend/src/api/client.ts` to match core helpers from `fizibilite/frontend/src/api.js`.
- Normalize list responses for schools, scenarios, users, countries, batches, and manager/admin list endpoints.
- Support numeric IDs throughout shared types and route params.
- Add missing API helpers that are immediately needed by existing screens:
  - `auth/change-password`
  - schools progress bulk
  - schools expense split stale bulk
  - scenario context
  - scenario progress
- Fix local run docs for:
  - `EXPO_PUBLIC_BACKEND_URL=http://tmffinance.com`
  - `corepack yarn expo start --web --port 3000 --clear`
- Add a small manual smoke checklist under `memory/`.

Acceptance:
- Existing mobile screens log in and load real data for admin and accountant.
- `/schools` lists Afghanistan schools for `muhasebe@gmail.com`.
- `/admin/user/:id` handles real users without invalid `limit` params.
- TypeScript and lint pass.

## PR 01 - Auth, Profile, And Role-Aware Home

Branch: `mobile/pr-01-auth-profile-home`

Purpose: Match web app login redirect and required password-reset behavior.

Scope:
- Port `/profile` behavior from `fizibilite/frontend/src/pages/ProfilePage.jsx`.
- Add `/profile` mobile route with password change.
- Enforce `must_reset_password` redirect before normal app access.
- Align post-login redirects with web:
  - admin -> admin/home or countries/admin dashboard
  - non-admin -> schools
- Replace the simple `/schools` header action area with a role-aware mobile dashboard:
  - admin: users, countries, permissions, progress, approvals, reports
  - manager: users, permissions, review queue, schools
  - accountant: schools, review queue/send flows
  - principal/hr/user: assigned school work
- Add clear empty, unauthorized, and loading states.

Acceptance:
- A user with `must_reset_password` cannot proceed until password is changed.
- Each role sees the correct home actions.
- Logout clears token and returns to login.

## PR 02 - Schools And Scenario List Parity

Branch: `mobile/pr-02-schools-scenarios-parity`

Purpose: Make school/scenario selection match the web app behavior.

Scope:
- Port behavior from:
  - `SchoolsPage.jsx`
  - `SelectPage.jsx`
  - school selection parts of `SchoolPage.jsx`
- Add school progress indicators using `/api/schools/progress`.
- Add scenario status, academic year, workflow status, currency, and progress metadata.
- Add scenario CRUD where role/permissions allow:
  - create scenario
  - update scenario metadata
  - delete scenario
- Add school create/delete where role/permissions allow.
- Handle closed schools where admin/manager views need them.
- Add principal assignment awareness for principal users.

Acceptance:
- Admin/accountant/manager see country schools and scenario lists matching web.
- Principal users see only assigned schools.
- Scenario creation and deletion follow backend validation and permissions.

## PR 03 - Scenario Shell, Permissions, And Workflow Actions

Branch: `mobile/pr-03-scenario-shell-workflow`

Purpose: Build the real mobile scenario shell before porting every editor field.

Scope:
- Port core behavior from `SchoolPage.jsx`:
  - selected scenario context
  - scenario context endpoint
  - progress requirements
  - work items
  - dirty state
  - module locks
  - submit/review work item
  - calculate
  - send for approval
  - admin approve/revise
- Port permission helper from `fizibilite/frontend/src/utils/permissions.js` into mobile.
- Add mobile tab/navigation model for:
  - Temel Bilgiler
  - Kapasite
  - Norm
  - IK
  - Gelirler
  - Giderler
  - Rapor
  - Detayli Rapor
- Add sticky mobile action bar for save/calculate/submit/send/export.

Acceptance:
- Module visibility and editability match web permission behavior.
- Principal/HR can submit assigned modules.
- Manager/accountant can review module submissions.
- Accountant/manager can send complete scenarios for admin approval.

## PR 04 - Temel Bilgiler And Kapasite Full Editors

Branch: `mobile/pr-04-temel-kapasite-editors`

Purpose: Replace MVP fields with production-level mobile editors for the first two modules.

Scope:
- Port domain behavior from:
  - `TemelBilgilerEditor.jsx`
  - `CapacityEditor.jsx`
  - `TemelBilgilerPage.jsx`
  - `KapasitePage.jsx`
- Preserve real input object shape expected by backend calculations.
- Track modified permission resources for saves.
- Add validation and local calculated summaries.
- Add test IDs for core inputs.

Acceptance:
- Editing and saving these modules produces data compatible with web.
- Backend permission enforcement accepts `modifiedResources`.
- Calculate results remain consistent with web for a known scenario.

## PR 05 - Norm, Grades, And IK Editors

Branch: `mobile/pr-05-norm-ik-editors`

Purpose: Port the staff/curriculum-heavy modules after the shell supports workflow and permissions.

Scope:
- Port domain behavior from:
  - `NormConfigEditor.jsx`
  - `GradesEditor.jsx`
  - `HREditorIK.jsx`
  - `NormPage.jsx`
  - `IKPage.jsx`
- Add mobile UI for curriculum weekly hours and teacher weekly max hours.
- Add role/local/international staff sections.
- Support local currency and program type assumptions from scenario context.
- Save through `/norm-config` and scenario inputs as appropriate.

Acceptance:
- Norm save/load matches web data.
- IK-derived expense rows remain compatible with Giderler calculations.
- Module progress responds correctly after save.

## PR 06 - Gelirler, Giderler, Discounts, And Expense Inputs

Branch: `mobile/pr-06-income-expenses-editors`

Purpose: Port the financial input modules.

Scope:
- Port domain behavior from:
  - `IncomeEditor.jsx`
  - `ExpensesEditor.jsx`
  - `DiscountsEditor.jsx`
  - `GelirlerPage.jsx`
  - `GiderlerPage.jsx`
- Preserve complex nested row structures used by the feasibility engine.
- Keep HR-derived expense rows read-only where web does.
- Add mobile totals and warnings equivalent to web.
- Track fine-grained modified permission resources.

Acceptance:
- Existing production scenarios load without field loss.
- Saves do not overwrite unrelated nested data.
- Report values after calculation match web for sample scenarios.

## PR 07 - Reports, Detailed Report, And Exports

Branch: `mobile/pr-07-reports-exports`

Purpose: Make mobile useful for reviewing results, not only editing inputs.

Scope:
- Port report behavior from:
  - `ReportView.jsx`
  - `DetailedReportView.jsx`
  - `RaporPage.jsx`
  - `DetayliRaporPage.jsx`
- Support `mode=original` and `mode=distributed`.
- Add currency switch where web supports it.
- Add mobile-friendly KPI tables and collapsible report sections.
- Add export/download/share support for:
  - `/export-xlsx`
  - PDF format when backend returns PDF
- Add admin rollup report preview or link-out if full mobile table is too large.

Acceptance:
- Summary and detailed reports match web values.
- XLSX/PDF export works on web preview and native device where supported.
- Large report tables remain readable on mobile.

## PR 08 - Expense Distribution And Batch Send Flows

Branch: `mobile/pr-08-expense-distribution-batch-send`

Purpose: Port the cross-scenario/cross-country operational flows.

Scope:
- Port behavior from:
  - `ExpenseSplitModal.jsx`
  - `BulkSendModal.jsx`
  - `CountrySendModal.jsx`
- Add mobile flows for:
  - expense distribution targets
  - preview/apply/revert distribution
  - stale distribution warnings
  - bulk send preview/apply
  - country approval batch preview/years/send

Acceptance:
- Distribution apply/revert matches web behavior on a test country.
- Bulk send and country batch flows show blockers before submit.
- No destructive action is possible without a confirmation sheet.

## PR 09 - Admin Completion

Branch: `mobile/pr-09-admin-completion`

Purpose: Bring admin mobile screens closer to web admin parity.

Scope:
- Harden existing mobile admin users/countries/approvals screens against real backend edge cases.
- Port missing admin pages:
  - `/progress` from `AdminProgressPage.jsx`
  - `/reports` from `AdminReportsPage.jsx`
  - `/manage-permissions` admin mode from `AdminPermissionsPage.jsx`
- Add user permission editor:
  - permissions catalog
  - user permissions get/set
  - country/school scoping
- Add school principal/HR assignment management:
  - `/admin/schools/:schoolId/principals`
  - `/admin/schools/:schoolId/assignments`

Acceptance:
- Admin can manage users, countries, schools, permissions, progress config, approvals, reports, and assignments from mobile.
- Existing web admin workflows have a mobile equivalent or documented mobile limitation.

## PR 10 - Manager Completion And Review Queue

Branch: `mobile/pr-10-manager-review-permissions`

Purpose: Complete manager/accountant operational workflows.

Scope:
- Port:
  - `ManagePermissionsPage.jsx`
  - `ManagerReviewQueuePage.jsx`
  - manager assignment drawers
- Add manager permission editor for country-scoped users.
- Add review queue with:
  - scenario/work item cards
  - filters
  - approve/revise actions
  - deep links into the relevant scenario module
- Add manager school principal/HR assignments where permitted.

Acceptance:
- Manager can perform country-scoped user and permission management.
- Manager/accountant review queue matches web results.
- Review actions update scenario/work-item state consistently.

## PR 11 - Native Readiness, QA, And Release Hardening

Branch: `mobile/pr-11-native-release-hardening`

Purpose: Prepare the app for real device usage after feature parity work.

Scope:
- Configure production app metadata, icon, splash, scheme, and display name.
- Confirm HTTP/HTTPS strategy for `tmffinance.com`; prefer HTTPS if available.
- Device QA:
  - Android phone
  - Android emulator
  - iOS simulator/device if available
  - Expo web on port 3000
- Add regression smoke scripts/checklists:
  - login/profile
  - schools/scenarios
  - each scenario module
  - report/export
  - admin/manager flows
- Review storage/security:
  - SecureStore token
  - remember-me behavior
  - no password persistence unless intentionally approved
- Prepare build instructions for EAS or native builds.

Acceptance:
- App can be tested on a physical phone against production backend.
- Known mobile limitations are documented.
- Release checklist is complete.

## Suggested Immediate Next PR

Start with **PR 00 - Real Backend Contract Baseline**.

Reason: recent debugging already showed real backend response-shape mismatches. If these are not fixed first, later feature work will keep failing for reasons unrelated to UI implementation.

Minimum PR 00 checklist:
- Replace all screen-local list parsing with API-client normalizers.
- Add missing core API helpers from web `api.js` without building UI yet.
- Smoke test these URLs/screens against `tmffinance.com`:
  - `/login`
  - `/schools`
  - `/school/:id`
  - `/scenario/:schoolId/:scenarioId`
  - `/admin/users`
  - `/admin/user/:id`
  - `/admin/countries`
  - `/admin/approvals`
  - `/manager/users`
- Document credentials and expected role behavior in a private, ignored test credentials file if credentials are needed locally.
