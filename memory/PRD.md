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

## Iteration 2 — Admin Users + real backend wired

- `EXPO_PUBLIC_BACKEND_URL` now points to **http://tmffinance.com** (user's real Node.js/MySQL backend). Their `/api/*` routes match the mobile client's expectations.
- iOS `NSAppTransportSecurity` + Android `usesCleartextTraffic` exceptions added in `app.json` for `tmffinance.com` (their API is HTTP not HTTPS — required for native builds).
- Admin CTA "Kullanıcı Yönetimi" appears on the schools screen for `role === "admin"` users.
- **`/admin/users`** screen: list with search, role filter chips (Yönetici/Müdür/Muhasebeci/Okul Müdürü/İK/Kullanıcı), avatar, role + country tags, "parola sıfırlama gerekli" indicator, pull-to-refresh, "Ekle" bottom-sheet (name/email/temp password/role/country).
- **`/admin/user/[id]`** screen: profile card, change role (6 roles), assign country, reset password (temp password modal + copy to clipboard), delete user with confirm modal, self-delete blocked.
- Demo FastAPI backend was extended with matching `/api/admin/users*` + `/api/admin/countries` routes (in-memory) so preview still works without user's backend.

### Known constraint for web preview only
tmffinance.com CORS is `Access-Control-Allow-Origin: http://localhost:3000` — the browser web-preview URL is different, so the web preview will get CORS blocked when pointed at the real backend. Native iOS/Android builds don't have CORS and will work fine. To also enable web-preview against real backend, ask the site operator to add the preview origin (or `*`) to CORS.
