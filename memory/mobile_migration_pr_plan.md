# Mobile Migration PR Plan

## Goal
Port the production `fizibilite` web application into the Expo mobile app in a controlled sequence. The mobile app must use the same production Node/Express/MySQL backend at `tmffinance.com`; `backend/server.py` is demo-only and must not define production behavior.

## Source Of Truth

### Web App
- Frontend: `fizibilite/frontend/src`
- Backend: `fizibilite/backend/src`
- API reference: `fizibilite/frontend/src/api.js`
- Permission reference: `fizibilite/frontend/src/utils/permissions.js`
- Scenario shell/workflow reference: `fizibilite/frontend/src/pages/SchoolPage.jsx`

### Current Mobile App
- Expo app: `frontend`
- Current routes:
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

## Planning Decisions
These are the default decisions for implementation unless explicitly changed later.

- Mobile must not allow editing/saving a module until that module is fully ported to the real production input shape.
- "Remember me" must not store passwords. Remember email only unless password persistence is explicitly approved.
- Mobile API helper names should mirror web `api.js`; add aliases for backwards compatibility where useful.
- School hard delete should not exist in mobile. The real backend intentionally blocks it; use close/reopen.
- Final admin scenario/batch approval should stay centralized in `/admin/approvals`.
- The FastAPI demo backend should stay lightweight. Keep it useful for login/schools/scenario read preview, not full production parity.

## Production Data Safety Rules
- Treat the current mobile scenario editor as unsafe for production saves until PR 03A/03B gates are in place.
- Do not save MVP-shaped fields like `toplamKapasite`, `siniflarSayisi`, `yillikUcret`, etc. into production scenarios.
- Real production inputs are nested, for example:
  - `kapasite.currentStudents`
  - `kapasite.years.y1`
  - `gelirler.tuition.rows`
  - `giderler.isletme.items`
- Safe options before full module ports:
  - read-only display, or
  - save only fully ported modules, or
  - patch known real fields while preserving unknown nested fields.
- Non-admin saves must send valid `modifiedResources` or legacy `modifiedPaths`.

## Cross-PR Rules
- Every PR must be shippable and testable against `http://tmffinance.com`.
- Expo web testing should use port `3000` because the production backend CORS currently allows `http://localhost:3000`.
- Native device testing is not blocked by browser CORS.
- Prefer response adapters in `frontend/src/api/client.ts`; screens should not guess response shapes.
- Every role-sensitive flow should be tested with available users for: `admin`, `manager`, `accountant`, `principal`, `hr`, and regular `user`.
- Do not port web CSS/layout literally. Port workflow, data contract, validation, permissions, and domain behavior into mobile-native UI.
- Every PR should pass:
  - `cd frontend && corepack yarn tsc --noEmit`
  - `cd frontend && corepack yarn lint`

## PR 00A - Repo And Runtime Safety Baseline

Branch: `mobile/pr-00a-runtime-safety`

Purpose: Clean up local/runtime safety before deeper production-backend work.

Scope:
- Ensure generated/runtime files are ignored:
  - `.venv`
  - `.expo`
  - `.metro-cache`
  - `*.log`
  - generated preview/export folders
- Add a `typecheck` script in `frontend/package.json`:
  - `"typecheck": "tsc --noEmit"`
- Add `memory/mobile-real-backend-contract.md`.
- Add `frontend/.env.example` with:
  - `EXPO_PUBLIC_BACKEND_URL=http://tmffinance.com`
- Document:
  - `backend/server.py` is demo-only.
  - `tmffinance.com` is the production contract.
  - Expo web should run on port `3000`.
- Remove or environment-gate demo credential hints from the production mobile login screen.
- Remove global `LogBox.ignoreAllLogs(true)` or enable it only for local demo mode.
- Change remember-me behavior to remember email only, not password.
- Confirm HTTP/HTTPS strategy:
  - prefer HTTPS if available;
  - keep native HTTP cleartext exceptions only while production API requires HTTP.

Acceptance:
- No generated runtime files appear in `git status`.
- `corepack yarn typecheck` and `corepack yarn lint` pass.
- Remember-me no longer persists passwords.
- Production login UI does not expose demo credentials.
- Runtime warnings are visible during real-backend QA.
- Local run notes clearly distinguish production backend from demo backend.

## PR 00 - Real Backend Contract Baseline

Branch: `mobile/pr-00-real-backend-contract`

Purpose: Make the existing mobile app safe and reliable against the production backend before adding new UI.

Scope:
- Expand `frontend/src/api/client.ts` to match the core web API contract from `fizibilite/frontend/src/api.js`.
- Normalize `EXPO_PUBLIC_BACKEND_URL` so both `http://tmffinance.com` and `http://tmffinance.com/api` resolve to the correct API root without duplicate `/api`.
- Add or normalize helpers for:
  - auth/session/profile/password change
  - list responses with `items`, named arrays, raw arrays, `total`, `limit`, `offset`, `fields`, `order`
  - schools and scenarios
  - scenario inputs
  - scenario context
  - scenario progress
  - report response
  - work items
  - approval queues
  - permission catalog and user permissions
  - binary/export URL helpers separated from JSON `request`
- Match web helper names or add aliases:
  - `getScenarioInputs`
  - `saveScenarioInputs`
  - `calculateScenario`
  - `getScenarioReport`
  - `getScenarioContext`
  - `getScenarioProgress`
- Add response adapters for real backend report shape:
  - real backend: `{ results, cached, calculatedAt }`
  - mobile report UI should either adapt this shape or show a clear temporary disabled state.
- Remove screen-local parsing such as `Array.isArray(res) ? res : res.users || []`.
- Support numeric IDs everywhere.
- Gate the current MVP scenario save path:
  - disable production saves from incomplete mobile modules, or
  - require valid `modifiedResources`, or
  - explicitly mark the module read-only.
- Confirm school delete is not implemented; close/reopen is the intended behavior.
- Add a manual smoke checklist under `memory/`.

Acceptance:
- Mobile API client has normalized helpers matching the core web `api.js` contract.
- No screen performs local response-shape guessing.
- Existing mobile screens load real production data without crashes.
- Scenario screen does not save MVP-shaped data into production scenarios.
- Report tab adapts real backend report shape or is temporarily disabled with a clear message.
- Non-admin save behavior is blocked or sends valid `modifiedResources`.
- School hard delete is not implemented.
- TypeScript and lint pass.
- Manual smoke covers:
  - login
  - schools
  - school detail
  - scenario detail
  - report load
  - admin users
  - admin countries
  - admin approvals
  - manager users

## PR 01 - Auth, Profile, And Role-Aware Home

Branch: `mobile/pr-01-auth-profile-home`

Purpose: Match web login/session behavior and create a safe role-aware mobile entry point.

Scope:
- Port `/profile` from `fizibilite/frontend/src/pages/ProfilePage.jsx`.
- Add `auth.changePassword`.
- Add session update behavior after password change.
- Add a protected-route guard for all authenticated app routes.
- Redirect unauthenticated users to `/login`.
- Enforce `must_reset_password` guard at route level.
- Redirect authenticated users with `must_reset_password` to `/profile`.
- Align post-login redirects with web behavior.
- Replace the simple `/schools` action area with role-aware home actions.
- Do not create dead navigation:
  - show links only for implemented routes, or
  - show disabled "coming later" tiles.
- Manager dashboard actions must be permission-aware, not role-only.
- Hide or disable manager permissions/review actions when required permissions are missing.
- Keep remember-me as email-only.

Acceptance:
- Users with `must_reset_password` cannot access normal app routes until password is changed.
- Dashboard actions match the user's role without linking to missing screens.
- Logout clears token and returns to login.

## PR 02 - Schools And Scenario List Parity

Branch: `mobile/pr-02-schools-scenarios-parity`

Purpose: Make school/scenario selection match web behavior and production permissions.

Scope:
- Port behavior from:
  - `SchoolsPage.jsx`
  - `SelectPage.jsx`
  - school/scenario selection parts of `SchoolPage.jsx`
- Add school progress indicators using `/api/schools/progress`.
- Add expense split stale indicators using `/api/schools/expense-split-stale`.
- Add scenario status, academic year, workflow status, currency, progress, and stale metadata.
- Add scenario CRUD where backend permits:
  - create scenario
  - update scenario metadata
  - delete scenario
- Add school create and close/reopen where role/permissions allow.
- School close/reopen currently uses admin route `/admin/schools/:schoolId`; do not expose it to manager/accountant unless backend support is added.
- Do not implement school hard delete.
- Handle closed schools where admin/manager views need them.
- Add principal assignment awareness for principal users.

Acceptance:
- Admin/accountant/manager see country schools and scenarios matching web.
- Principal users see only assigned schools.
- School close/reopen follows backend behavior.
- Scenario creation/update/delete follows backend validation and permissions.

## PR 03A - Scenario Shell And Safe Read Mode

Branch: `mobile/pr-03a-scenario-shell-safe-read`

Purpose: Build the real mobile scenario shell without risking production input corruption.

Scope:
- Load scenario context.
- Load scenario progress.
- Load work items.
- Show mobile tabs for:
  - Temel Bilgiler
  - Kapasite
  - Norm
  - IK
  - Gelirler
  - Giderler
  - Rapor
  - Detayli Rapor
- Show module locks, status, progress, missing fields, and review notes.
- Respect HQ/headquarter scenario required-work-id behavior:
  - normal scenarios require all base work IDs;
  - HQ scenarios require only `ik.local_staff`, `gelirler.unit_fee`, and `giderler.isletme`.
- Disable saving for modules not fully ported.
- Add dirty-state infrastructure without enabling unsafe saves.
- Add a sticky mobile action area for safe actions only.

Acceptance:
- Existing production scenario data can be opened without mutation.
- Incomplete modules are read-only or explicitly disabled.
- Users can see context, progress, work item state, and report availability.

## PR 03B - Workflow Actions And Permissions

Branch: `mobile/pr-03b-workflow-permissions`

Purpose: Add workflow actions once the shell can safely represent production state.

Scope:
- Port `permissions.js`.
- Port `pathToResources` / modified-resource mapping from `SchoolPage.jsx`.
- Define canonical work IDs:
  - `temel_bilgiler`
  - `kapasite`
  - `norm.ders_dagilimi`
  - `ik.local_staff`
  - `gelirler.unit_fee`
  - `giderler.isletme`
- Respect HQ/headquarter scenario required-work-id behavior in submit/send blockers:
  - normal scenarios require all base work IDs;
  - HQ scenarios require only `ik.local_staff`, `gelirler.unit_fee`, and `giderler.isletme`.
- Add valid `modifiedResources` for any enabled save.
- Add work-item actions:
  - submit work item
  - manager/accountant approve/revise work item
- Add send-for-approval for manager/accountant where backend allows it.
- Respect scenario locks.
- For admin users, show review status and deep-link to `/admin/approvals`; do not duplicate final admin approval inside scenario shell.

Acceptance:
- Module visibility/editability matches web permission behavior.
- Principal/HR can submit assigned modules.
- Manager/accountant can review submitted modules.
- Accountant/manager can send complete scenarios for admin approval.
- Final admin approve/revise remains centralized in admin approvals.

## PR 04A - Shared Mobile Form And Patch Infrastructure

Branch: `mobile/pr-04a-form-patch-infra`

Purpose: Prepare safe editor ports with reusable primitives and real input patch helpers.

Scope:
- Add shared mobile form components for dense financial forms.
- Add immutable nested patch helpers.
- Add unknown-field preservation helpers.
- Add real input shape fixtures from production-like data.
- Add module-level save harness that requires:
  - enabled module
  - real input shape adapter
  - valid `modifiedResources`

Acceptance:
- New editors can save only through the safe module save harness.
- Unknown nested production fields are preserved by default.

## PR 04B - Temel Bilgiler Editor

Branch: `mobile/pr-04b-temel-bilgiler-editor`

Purpose: Port Temel Bilgiler fully before enabling saves for that module.

Scope:
- Port domain behavior from:
  - `TemelBilgilerEditor.jsx`
  - `TemelBilgilerPage.jsx`
- Preserve real input shape.
- Track correct modified resources.
- Add validation and mobile summaries.

Acceptance:
- Temel Bilgiler load/save matches web on a production scenario.
- No unrelated input sections are overwritten.

## PR 04C - Kapasite And Grades Basics

Branch: `mobile/pr-04c-kapasite-grades`

Purpose: Port capacity fields and grade basics safely.

Scope:
- Port domain behavior from:
  - `CapacityEditor.jsx`
  - `GradesEditor.jsx` where needed
  - `KapasitePage.jsx`
- Preserve real nested `kapasite` structure.
- Track correct modified resources.
- When porting `GradesEditor`, track `grades_plan` permissions separately from `kapasite`.
- Do not send only `section.kapasite.caps` for grade/branch plan changes.

Acceptance:
- Kapasite load/save matches web.
- Progress/calculation remains consistent after save.

## PR 05A - Norm Config

Branch: `mobile/pr-05a-norm-config`

Purpose: Port Norm configuration in isolation.

Scope:
- Port domain behavior from:
  - `NormConfigEditor.jsx`
  - `NormPage.jsx`
- Use `/schools/:schoolId/norm-config?scenarioId=:scenarioId` when editing scenario-specific norm config.
- Support curriculum weekly hours and teacher weekly max hours.

Acceptance:
- Norm save/load matches web and backend schema.
- Norm progress updates correctly.

## PR 05B - IK Editor

Branch: `mobile/pr-05b-ik-editor`

Purpose: Port staffing and HR cost inputs.

Scope:
- Port domain behavior from:
  - `HREditorIK.jsx`
  - `IKPage.jsx`
- Support local/international staff structures.
- Preserve IK-derived expense assumptions used by Giderler.

Acceptance:
- IK load/save matches web.
- Derived expense values remain compatible with reports.

## PR 06A - Gelirler Editor

Branch: `mobile/pr-06a-gelirler-editor`

Purpose: Port income inputs safely.

Scope:
- Port domain behavior from:
  - `IncomeEditor.jsx`
  - `GelirlerPage.jsx`
- Preserve rows for tuition, non-education fees, dormitory, and other institution income.

Acceptance:
- Gelirler load/save matches web.
- Report results remain consistent after calculation.

## PR 06B - Discounts Editor

Branch: `mobile/pr-06b-discounts-editor`

Purpose: Port discount inputs separately to reduce financial-data risk.

Scope:
- Port `DiscountsEditor.jsx`.
- Preserve discount row structures and calculations.

Acceptance:
- Discount edits match web behavior and do not corrupt Gelirler rows.

## PR 06C - Giderler Editor

Branch: `mobile/pr-06c-giderler-editor`

Purpose: Port expense inputs safely.

Scope:
- Port domain behavior from:
  - `ExpensesEditor.jsx`
  - `GiderlerPage.jsx`
- Preserve `isletme`, `ogrenimDisi`, `yurt`, and related nested items.
- Keep HR-derived expense rows read-only where web does.

Acceptance:
- Giderler load/save matches web.
- HR-derived rows are protected.
- Report results remain consistent after calculation.

## PR 07 - Reports, Detailed Report, And Exports

Branch: `mobile/pr-07-reports-exports`

Purpose: Make mobile useful for reviewing results.

Scope:
- Port report behavior from:
  - `ReportView.jsx`
  - `DetailedReportView.jsx`
  - `RaporPage.jsx`
  - `DetayliRaporPage.jsx`
- Support original report mode fully.
- Support distributed mode as read-only only when existing distribution metadata/results exist.
- Defer creating/applying/reverting distributions to PR 08.
- Add currency switch where web supports it.
- Add mobile-friendly KPI tables and collapsible report sections.
- Add export/download/share support for:
  - `/export-xlsx`
  - PDF format when backend returns PDF
- Add native export/share dependencies if needed, such as `expo-file-system` and `expo-sharing`.
- Keep web export behavior separate from native file sharing behavior.

Acceptance:
- Original mode matches web values.
- Distributed mode is read-only and only shown when existing distribution metadata exists.
- XLSX/PDF export works where platform support allows it.
- Large report tables remain readable on mobile.

## PR 08 - Expense Distribution And Batch Send Flows

Branch: `mobile/pr-08-expense-distribution-batch-send`

Purpose: Port cross-scenario/cross-country operational flows.

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
- Destructive actions require confirmation.

## PR 09 - Admin Completion

Branch: `mobile/pr-09-admin-completion`

Purpose: Bring admin mobile screens close to web admin parity.

Scope:
- Harden existing mobile admin users/countries/approvals screens against real backend edge cases.
- Keep final admin scenario/batch review in `/admin/approvals`.
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
- Manager permission-management actions must check required permissions such as `page.manage_permissions:write`, not only `role === "manager"`.
- Hide or disable manager permissions/review actions when required permissions are missing.
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

Purpose: Prepare the app for production device usage after feature parity work.

Scope:
- Configure production app metadata, icon, splash, scheme, and display name.
- Reconfirm HTTP/HTTPS strategy for `tmffinance.com`; prefer HTTPS if available.
- Device QA:
  - Android phone
  - Android emulator
  - iOS simulator/device if available
  - Expo web on port `3000`
- Add regression smoke scripts/checklists:
  - login/profile
  - schools/scenarios
  - each scenario module
  - report/export
  - admin/manager flows
- Review storage/security again:
  - SecureStore token
  - email-only remember-me
  - no password persistence
- Prepare build instructions for EAS or native builds.

Acceptance:
- App can be tested on a physical phone against production backend.
- Known mobile limitations are documented.
- Release checklist is complete.

## Immediate Next Step

Start with **PR 00A**, then **PR 00**.

PR 00 is accepted only when:
- Mobile API client has normalized helpers matching the core web `api.js` contract.
- No screen performs local response-shape guessing.
- Existing mobile screens load real production data without crashes.
- Scenario screen does not save MVP-shaped data into production scenarios.
- Report tab either adapts real backend report shape or is temporarily disabled with a clear message.
- Non-admin save behavior is blocked or sends valid `modifiedResources`.
- School delete is not implemented; close/reopen is documented as intended behavior.
- TypeScript and lint pass.
- Manual smoke covers login, schools, school detail, scenario detail, report load, admin users, admin countries, admin approvals, and manager users.
