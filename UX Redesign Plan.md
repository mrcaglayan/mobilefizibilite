

# Mobile UI/UX Redesign Plan

## Goal

Redesign the Expo / React Native mobile frontend in `/frontend` into a modern, light, rounded, card-based mobile UI inspired by the provided Turkcell screenshots.

The design should use the screenshots only as **style inspiration**:

* light background
* rounded white cards
* blue/yellow accent system
* search/header area
* bottom tabs
* large progress/status cards
* horizontal cards
* reward/action cards
* clean section headers

Do **not** copy Turkcell branding, logos, text, images, or exact layouts.

---

# PR-MOBILE-UI-01 — Theme foundation + reusable UI components

## Purpose

Create the shared design system first so later screens can be redesigned safely and consistently.

## Scope

Work only inside `/frontend`.

Likely files:

```text
frontend/src/theme.ts
frontend/src/theme-provider.tsx
frontend/src/ui/components.tsx
frontend/src/ui/AppBottomNav.tsx
```

New helper files are okay if cleaner, for example:

```text
frontend/src/ui/layout.tsx
frontend/src/ui/cards.tsx
```

## Tasks

Update the theme to be **light-first**:

```text
background: very light gray / blue-gray
surface/card: white
primary: deep blue
accent: yellow/gold
text: dark navy
muted text: blue-gray
border: soft blue-gray
shadow: subtle mobile card shadow
```

Create reusable UI primitives:

```text
AppTopHeader
SearchHeader
SectionHeader
QuickActionGrid
QuickActionTile
GradientHeroCard
ProgressUsageCard
HorizontalCardRail
OfferLikeCard
RewardActionCard
ModuleCard
EmptyStateCard
StatusPill
```

Update bottom navigation:

* white background
* soft top border
* active item blue
* inactive item gray
* friendly icon + label layout
* keep existing permission-based visibility
* do not expose unauthorized pages

## Important safeguards

Do not change:

```text
API calls
routing
permissions
workflow logic
save harness
scenario logic
role logic
dirty guard logic
```

## Acceptance criteria

* App has a consistent light theme foundation.
* Shared UI components are ready for screen redesigns.
* Bottom nav looks modern and light.
* No existing navigation behavior is broken.
* TypeScript passes.
* Lint passes.

## Codex prompt

```text
Implement PR-MOBILE-UI-01.

Work only in /frontend.

Create the light-first theme foundation and reusable UI components for the mobile redesign inspired by the provided Turkcell screenshots, without copying branding, logos, images, text, or exact content.

Do not redesign all screens yet.

Update:
- src/theme.ts
- src/theme-provider.tsx
- src/ui/components.tsx
- src/ui/AppBottomNav.tsx

Create reusable UI primitives:
- AppTopHeader
- SearchHeader
- SectionHeader
- QuickActionGrid
- QuickActionTile
- GradientHeroCard
- ProgressUsageCard
- HorizontalCardRail
- OfferLikeCard
- RewardActionCard
- ModuleCard
- EmptyStateCard
- StatusPill

Design direction:
- light-first
- white rounded cards
- very light blue-gray background
- deep blue primary
- yellow/gold accent
- dark navy text
- blue-gray muted text
- soft borders
- subtle shadows

Update bottom navigation:
- white background
- soft top border
- blue active icon/label
- gray inactive icon/label
- preserve existing permission/role-based visibility

Do not change:
- backend API contracts
- routing behavior
- workflow logic
- permissions
- roles
- save harness
- scenario status logic
- dirty guards

Search for hardcoded dark background colors such as:
#071020, #0B1628, #101A2D, #16233A, #0F172A

Do not blindly replace dark text colors. Only fix inappropriate dark backgrounds/cards in light mode.

Run:
- yarn typecheck
- yarn lint

Report:
- touched files
- what changed
- whether typecheck/lint passed
- known limitations
```

---

# PR-MOBILE-UI-02 — Schools home dashboard redesign

## Purpose

Turn `schools.tsx` into the main home/dashboard screen similar to the first Turkcell screenshot.

## Scope

Likely files:

```text
frontend/app/schools.tsx
frontend/src/ui/components.tsx
```

## Tasks

Redesign the schools page as a home dashboard:

* top search/header area
* profile/logout icon area
* large hero/progress card
* quick action tiles
* “Okullarım” section
* modern school cards

Suggested quick actions:

```text
Okullar
İnceleme Kuyruğu
Toplu Gönder
Raporlar
Yetkiler / Ayarlar if permission exists
```

School cards should show:

```text
school name
country / location if available
period / scenario summary if available
progress if available
warning/stale state if available
CTA button
```

## Important safeguards

Keep:

```text
existing school fetch logic
existing permissions
existing navigation
existing refresh behavior
existing testIDs where possible
```

## Acceptance criteria

* Schools page feels like a polished mobile home screen.
* No fake data.
* Loading state looks clean.
* Empty state looks clean.
* Error state looks clean.
* Pull-to-refresh still works.
* Content is not hidden behind bottom nav.

## Codex prompt

```text
Implement PR-MOBILE-UI-02.

Work only in /frontend.

Redesign app/schools.tsx into a modern light dashboard/home screen inspired by the provided Turkcell screenshots.

Use the shared components created in PR-MOBILE-UI-01.

Do not copy Turkcell branding, logos, images, text, or exact layout.

Requirements:
- top search/header area
- search placeholder like “Okul, senaryo veya işlem arayın”
- profile/logout icon area if already available
- large hero/progress card using existing real data or safe fallback text
- quick action tiles using existing permissions/routes
- “Okullarım” section
- rounded white school cards
- school cards show name, country/location, progress/status/warnings if available
- clear CTA for opening school/scenarios

Preserve:
- backend API contracts
- existing fetch logic
- routing
- permissions
- role visibility
- pull-to-refresh
- testIDs where possible

Do not implement fake data.

Ensure:
- no black/dark cards in light mode
- content not hidden behind bottom nav
- loading/empty/error states are polished

Run:
- yarn typecheck
- yarn lint

Report:
- touched files
- what changed
- whether typecheck/lint passed
- known limitations
```

---

# PR-MOBILE-UI-03 — School detail + scenario list redesign

## Purpose

Redesign the selected school page and scenario cards in a style similar to the “Paketler” screenshot.

## Scope

Likely files:

```text
frontend/app/school/[id].tsx
frontend/src/ui/components.tsx
```

## Tasks

Redesign school detail page:

* school header card
* active period/status display
* scenario sections
* rounded white scenario cards
* progress/status pills
* warning/blocked indicators
* clean CTA buttons

Scenario cards should feel like package/product cards, but with app-specific content:

```text
Scenario name
Period/year
Status
Completion/progress
Required action
CTA
```

## Important safeguards

Do not change scenario selection logic.

Do not change period logic.

Do not change navigation behavior.

## Acceptance criteria

* School detail page is light, clean, and easy to scan.
* Scenario list cards no longer look dark.
* Existing scenario opening behavior works.
* Existing permissions remain intact.
* Typecheck/lint pass.

## Codex prompt

```text
Implement PR-MOBILE-UI-03.

Work only in /frontend.

Redesign app/school/[id].tsx using a clean package-list/card style inspired by the Turkcell package screenshots.

Use existing API data only. Do not implement fake data.

Requirements:
- light background
- school summary/header card
- active period/scenario status shown clearly
- scenario cards as rounded white cards
- status pills
- progress/completion if available
- blocked/warning indicators if available
- clear CTA to open scenario
- no black/dark cards in light mode

Preserve:
- backend API contracts
- school fetch logic
- scenario fetch logic
- period logic
- routing
- permissions
- testIDs where possible

Do not change workflow logic or scenario status logic.

Run:
- yarn typecheck
- yarn lint

Report:
- touched files
- what changed
- whether typecheck/lint passed
- known limitations
```

---

# PR-MOBILE-UI-04 — Review queue + admin approvals redesign

## Purpose

Redesign review/approval screens in a style similar to the “Hediyeler” reward/action cards.

## Scope

Likely files:

```text
frontend/app/manager/review-queue.tsx
frontend/app/admin/approvals.tsx
frontend/src/ui/components.tsx
```

## Tasks

Each review/approval item should be a vertical action card:

```text
title
school
scenario
module/work item
explanation
status pill
CTA/action area
```

Use a bottom colored CTA band or action area like the gift cards in the screenshot.

## Important safeguards

Do not change:

```text
approval logic
review lock logic
admin blocked/restricted behavior
permissions
routes
API payloads
```

## Acceptance criteria

* Review queue looks like modern reward/action cards.
* Admin approvals look consistent.
* No black cards in light mode.
* Buttons are clear and rounded.
* Existing actions still work.
* Typecheck/lint pass.

## Codex prompt

```text
Implement PR-MOBILE-UI-04.

Work only in /frontend.

Redesign:
- app/manager/review-queue.tsx
- app/admin/approvals.tsx

Use a modern light reward/action-card style inspired by the Turkcell Hediyeler screenshot.

Do not copy branding, text, logos, images, or exact layout.

Each card should show:
- title
- school
- scenario
- module/work item if available
- explanation
- status pill
- clear CTA/action area

Use:
- white rounded cards
- soft shadows
- deep blue primary buttons
- optional colored CTA band
- polished loading/empty/error states

Preserve:
- backend API contracts
- approval/review logic
- admin restrictions
- permissions
- routing
- review lock behavior
- testIDs where possible

Do not change workflow behavior.

Ensure:
- no black/dark cards in light theme
- content is not hidden behind bottom nav

Run:
- yarn typecheck
- yarn lint

Report:
- touched files
- what changed
- whether typecheck/lint passed
- known limitations
```

---

# PR-MOBILE-UI-05 — Scenario screen tabs/modules redesign

## Purpose

Fix the remaining dark cards in scenario tabs/modules and make the scenario screen match the new light design.

## Scope

Likely files:

```text
frontend/app/scenario/[schoolId]/[scenarioId].tsx
frontend/src/ui/components.tsx
```

Possibly module editor wrapper files if they contain hardcoded card styles.

## Tasks

Redesign:

```text
scenario header
module tabs
module cards
status/progress area
save/review action area
```

Module tabs should become:

* rounded chips
* white cards
* clear active state
* blue/yellow accent
* no black/dark cards in light theme

## Important safeguards

This is workflow-sensitive.

Do not change:

```text
dirty guard
save behavior
save harness
module adapters
review lock behavior
module completion logic
required work ID logic
HQ required work logic
permissions
routing
```

## Acceptance criteria

* Scenario screen is light and consistent.
* Module tabs/cards are no longer black.
* Dirty guard still works.
* Save still works.
* Review lock behavior still works.
* Admin/non-admin behavior still works.
* Typecheck/lint pass.

## Codex prompt

```text
Implement PR-MOBILE-UI-05.

Work only in /frontend.

Redesign app/scenario/[schoolId]/[scenarioId].tsx to match the new light card-based design.

Focus on:
- scenario header
- scenario status/progress area
- module tabs/cards
- action buttons
- remaining dark/black card issue in light mode

Module tabs should look like rounded category chips/cards:
- white background
- soft border
- active blue/yellow state
- dark navy text
- no black/dark cards in light theme

Preserve exactly:
- dirty guard behavior
- save behavior
- save harness behavior
- module adapters
- review lock behavior
- scenario status logic
- workflow logic
- permissions
- routing
- testIDs where possible

Do not change:
- backend API contracts
- required work IDs
- HQ required IDs
- module editor business logic

Search for hardcoded dark backgrounds:
#071020, #0B1628, #101A2D, #16233A, #0F172A

Only remove inappropriate dark backgrounds/cards. Do not blindly change all dark colors.

Run:
- yarn typecheck
- yarn lint

Report:
- touched files
- what changed
- whether typecheck/lint passed
- known limitations
```

---

# PR-MOBILE-UI-06 — Discover / reports / final visual polish

## Purpose

Polish secondary screens and make the whole app visually consistent.

## Scope

Likely files depend on your app routes, for example:

```text
frontend/app/reports/*
frontend/app/admin/*
frontend/app/manager/*
frontend/app/settings/*
frontend/app/discover/*
```

Only touch existing screens.

## Tasks

* Apply grid card style similar to the fourth screenshot.
* Polish secondary screens.
* Fix spacing around bottom nav.
* Make empty/error/loading states consistent.
* Remove leftover dark card backgrounds.
* Ensure all screen backgrounds use theme.
* Final pass on typography and spacing.

## Acceptance criteria

* All main screens feel like one app.
* No accidental dark cards in light mode.
* Navigation remains permission-safe.
* Typecheck/lint pass.
* No fake data.

## Codex prompt

```text
Implement PR-MOBILE-UI-06.

Work only in /frontend.

Do a final visual consistency pass for secondary mobile screens such as reports/admin/settings/discover/manager screens where they exist.

Use the new light card-based design system.

Requirements:
- grid-style cards where appropriate, inspired by the fourth Turkcell screenshot
- polished loading/empty/error states
- consistent white cards
- consistent blue/yellow accents
- no content hidden behind bottom navigation
- no black/dark cards in light mode
- no fake data

Preserve:
- backend API contracts
- permissions
- routing
- workflow logic
- role behavior
- save/review logic
- testIDs where possible

Run:
- yarn typecheck
- yarn lint

Report:
- touched files
- what changed
- whether typecheck/lint passed
- known limitations
```

---

# Recommended implementation order

```text
PR-MOBILE-UI-01
Theme + shared UI + bottom nav

PR-MOBILE-UI-02
Schools dashboard

PR-MOBILE-UI-03
School detail + scenario list

PR-MOBILE-UI-04
Review queue + admin approvals

PR-MOBILE-UI-05
Scenario screen tabs/modules + dark card fix

PR-MOBILE-UI-06
Secondary screens + final polish
