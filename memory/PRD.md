# Feasibility Studio — Mobile MVP (PRD)

## Overview
Mobile Expo/React Native port of the Turkish "Feasibility Studio" web app for school financial feasibility planning. The full web app has 15+ pages (~11K lines of editors); this mobile MVP focuses on the **core scenario editing** flow.

## Scope (user-chosen options: 1b + 2b + 3b + 4a + 5a)
- **1b Core scenario editing** — login, schools list, scenarios list, 6-tab scenario editor + summary report
- **2b User hosts real Node.js/MySQL backend externally** — this repo ships a matching FastAPI demo backend so the mobile client previews immediately; user later points `EXPO_PUBLIC_BACKEND_URL` in `/app/frontend/.env` at their own API
- **3b Simple email/password JWT** auth
- **4a Turkish UI** throughout
- **5a No Excel/PDF export** on mobile

## Features shipped
1. **Login** — Turkish hero, e-posta/parola, "Beni hatırla" (persisted in AsyncStorage), password reveal, demo credential hint, error banner. JWT stored in SecureStore.
2. **Schools list** — pull-to-refresh, per-school progress bar, greeting with user role/country, logout.
3. **Scenarios list per school** — state badges (Taslak / Gönderildi / Onaylandı), currency + last-updated meta.
4. **Scenario editor with 6 tabs**:
   - **Temel Bilgiler** — okul adı, kampüs, şehir, kademeler (Anaokulu/İlkokul/Ortaokul/Lise chips), başlangıç yılı, planlama yılı, para birimi (TRY/USD/EUR), notlar
   - **Kapasite** — toplam kapasite, sınıf sayısı, sınıf başına öğrenci, hedef doluluk % + live "Aktif öğrenci" calc
   - **İK** — öğretmen/idari/destek sayıları, ortalama maaş, yıllık artış % + live monthly + yearly personnel cost
   - **Gelirler** — yıllık ücret, kayıt ücreti, indirim oranı, ek gelirler
   - **Giderler** — personel, kira, işletme, yatırım, diğer + total
   - **Rapor** — 4 KPI cards (Toplam Gelir/Gider, Faaliyet Karı, Kâr Marjı), kapasite kullanımı, öğrenci başına gelir/gider, gelir & gider dağılım bar charts
5. **Save flow** — dirty-state tracking, save button flips between "Kaydet"/"Kayıtlı", success haptic + toast, rapor tab shows warning banner when unsaved.

## Architecture
- **Frontend:** Expo Router file-based routes (`/login`, `/schools`, `/school/[id]`, `/scenario/[schoolId]/[scenarioId]`), SecureStore for JWT, AsyncStorage for remember-me, `@expo/vector-icons`, `react-native-safe-area-context`, `expo-haptics`, `expo-linear-gradient`.
- **Demo Backend (mock):** FastAPI in-memory implementation of `/api/auth/login`, `/api/auth/me`, `/api/schools`, `/api/schools/{id}/scenarios`, `/api/schools/{id}/scenarios/{id}/inputs` (GET/PUT), `/api/schools/{id}/scenarios/{id}/report`. 3 seed schools, 4 seed scenarios, 2 seed users. Simple base64 fake JWT (demo-only).
- **Design language:** dark navy canvas (#0B1220) + amber accent (#F5B301), corporate finance aesthetic mirroring the web app.

## To point the app at YOUR real Node.js/MySQL backend
1. Deploy your existing `abc/backend` Node server anywhere (Vercel, Fly.io, EC2, etc.) exposing the same routes under `/api`.
2. Edit `/app/frontend/.env` → change `EXPO_PUBLIC_BACKEND_URL` to your backend origin (e.g. `https://api.mydomain.com`).
3. Restart expo. That's it — mobile client works against your real data.

## Not included (out of MVP scope, deferrable)
- Admin panels (users, countries, permissions, approvals, reports rollup)
- Bulk send / country approval batch modals
- Expense split modal (ExpenseSplitModal 966 LoC on web)
- Norm config editor (1229 LoC)
- Detailed report view (2628 LoC on web)
- Excel / PDF export
- Password reset / must_reset_password flow
- Manager review queue

## Test credentials
See `/app/memory/test_credentials.md`.

## Test status
Backend: 12/12 pytest passed. Frontend: full E2E flow (login → schools → scenarios → editor → save → report → logout) verified.

## Iteration 4 — Manager Users Management

### Schools screen
- For `role === "manager"` users the CTA area shows a single **Kullanıcılar** tile that goes to `/manager/users` and displays their country in the subtitle.

### Müdür Kullanıcı Yönetimi — `/manager/users`
- Country-scoped list (manager sees only their own country's users)
- Search by name/email + role filter chips (Tümü / Okul Müdürü / İK / Kullanıcı)
- Admins and other managers in the same country appear as **read-only rows with a lock icon** (cannot be edited via manager endpoints)
- "Ekle" bottom sheet: name, email, temp password + role chips restricted to **Okul Müdürü / İK** (server enforces same). 400 on any other role.

### Müdür Kullanıcı Detay — `/manager/user/[id]`
- Profile card + kullanıcı ID + ülke rows
- **Rol** kartı: 3 chip'e restricted (Okul Müdürü / İK / Kullanıcı) — server enforces
- **E-posta** kartı: inline edit with dirty-state save button; duplicate 409 in Turkish
- **Parola** kartı: reset generates 12-char password shown in modal with copy-to-clipboard
- **No delete** (matches original web behavior)

### API surface added
- `GET /api/manager/users` (country-scoped)
- `POST /api/manager/users` (principal/hr only)
- `PATCH /api/manager/users/:id/role`
- `PATCH /api/manager/users/:id/email`
- `POST /api/manager/users/:id/reset-password`
- All above require `role === "manager"` or `"admin"` and enforce country scoping (403 cross-country)

### Verification
- **curl**: list, create-principal-200, create-admin-role-400, patch role, patch email, reset-password, non-manager-403 — all pass
- **screenshots**: 8 flows (login as manager → schools with tile → users list showing lock icons on peers → filter to principals → create-user sheet filled → user detail → role change with toast → email update → temp password modal)

### On phone
`EXPO_PUBLIC_BACKEND_URL` restored to `http://tmffinance.com`. Manager users management uses your real `/api/manager/*` routes on device.

---


### Schools screen refactor
- Replaced single "Kullanıcı Yönetimi" CTA with a **3-tile grid** for admin users: **Kullanıcılar**, **Ülkeler**, **Onaylar**.

### Ülkeler (`/admin/countries`)
- List of countries (name, code chip, region). Tap → country detail.
- "Ekle" bottom sheet: name, code (auto-uppercase, 2-3 chars), region chips (EMEA/APAC/AMERICAS/GLOBAL).
- Duplicate code → 409 with Turkish error.

### Country detail (`/admin/country/[id]`)
- Country info header (flag chip, region, school count).
- Status filter chips: Tümü / Aktif / Kapalı.
- Schools list per country with tap-to-open (goes to normal scenarios list) and per-row **KAPAT / AÇ** toggle.
- "Okul Ekle" bottom sheet with country context reminder.

### Onaylar (`/admin/approvals`)
- Segmented control: **Senaryolar** | **Ülke Batch'leri**.
- Status filter chips (Tümü / Onay Bekliyor / Gönderildi / Onaylandı / Revizyon / Taslak).
- **Scenario cards:** school + scenario + academic year, country/region, colored status badge, Y1/Y2/Y3 KPI mini strip (net_result + margin), review note if present, progress %.
- **Batch cards:** country name, batch id + academic year, scenario/school count.
- **Review bottom sheet** (both scenarios and batches):
  - Toggle **Onayla / Revizyon İste**.
  - Approve → year chips (Y1/Y2/Y3, defaulted all on).
  - Revise → module chips (Temel Bilgiler / Kapasite / İK / Gelirler / Giderler) + required note.
  - Batch review shows expandable list of contained scenarios (school + scenario names, "Kaynak" badge).

### Backend / API surface (added to demo backend at `/app/backend/server.py`)
- `POST /api/admin/countries` (409 on duplicate code)
- `GET /api/admin/countries/{id}/schools` + `POST` to create school (409 on dup name)
- `PATCH /api/admin/schools/{id}` for name/status
- `GET /api/admin/scenarios/queue` (with status/academicYear/region/countryId filters)
- `PATCH /api/admin/scenarios/{id}/review` (approve requires `sent_for_approval` status; revise requires note + revisionWorkIds)
- `GET /api/admin/approval-batches/queue` + `GET /api/admin/approval-batches/{id}` (detail with items)
- `PATCH /api/admin/approval-batches/{id}/review`

### Testing
Verified via curl: create/list countries, dup 409, list/create schools, close/reopen school, scenarios queue, approve (409 on wrong status), revise (400 without note), batch queue, batch detail, batch approve.
Verified via mobile screenshots: all 9 flows (schools grid → countries list → create country → country detail → approvals scenarios → review approve → review revise → batches → batch review with items).

### On phone (via Expo Go)
`EXPO_PUBLIC_BACKEND_URL` is set to **http://tmffinance.com** — all these admin flows call your real backend when running on a device.

- `EXPO_PUBLIC_BACKEND_URL` now points to **http://tmffinance.com** (user's real Node.js/MySQL backend). Their `/api/*` routes match the mobile client's expectations.
- iOS `NSAppTransportSecurity` + Android `usesCleartextTraffic` exceptions added in `app.json` for `tmffinance.com` (their API is HTTP not HTTPS — required for native builds).
- Admin CTA "Kullanıcı Yönetimi" appears on the schools screen for `role === "admin"` users.
- **`/admin/users`** screen: list with search, role filter chips (Yönetici/Müdür/Muhasebeci/Okul Müdürü/İK/Kullanıcı), avatar, role + country tags, "parola sıfırlama gerekli" indicator, pull-to-refresh, "Ekle" bottom-sheet (name/email/temp password/role/country).
- **`/admin/user/[id]`** screen: profile card, change role (6 roles), assign country, reset password (temp password modal + copy to clipboard), delete user with confirm modal, self-delete blocked.
- Demo FastAPI backend was extended with matching `/api/admin/users*` + `/api/admin/countries` routes (in-memory) so preview still works without user's backend.

### Known constraint for web preview only
tmffinance.com CORS is `Access-Control-Allow-Origin: http://localhost:3000` — the browser web-preview URL is different, so the web preview will get CORS blocked when pointed at the real backend. Native iOS/Android builds don't have CORS and will work fine. To also enable web-preview against real backend, ask the site operator to add the preview origin (or `*`) to CORS.
