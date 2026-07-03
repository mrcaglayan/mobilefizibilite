# Mobile Real Backend Contract

## Production API
- Production backend: `http://tmffinance.com`
- Mobile env key: `EXPO_PUBLIC_BACKEND_URL`
- Example file: `frontend/.env.example`
- Expo web QA should run on port `3000` because the production backend currently allows `http://localhost:3000` for browser CORS.

## Demo Backend
- `backend/server.py` is demo-only.
- It exists for local preview and isolated UI development.
- It must not define production behavior or override contracts from `fizibilite/backend/src`.

## Source Of Truth
- Web API helper reference: `fizibilite/frontend/src/api.js`
- Backend route reference: `fizibilite/backend/src/routes`
- Permission reference: `fizibilite/frontend/src/utils/permissions.js`
- Scenario workflow reference: `fizibilite/frontend/src/pages/SchoolPage.jsx`

## HTTP / HTTPS
- Prefer HTTPS for production mobile builds if `tmffinance.com` exposes it.
- Keep native HTTP cleartext exceptions only while the production API requires HTTP.
- Web preview may fail on ports other than `3000` because of backend CORS.

## Local Run
```powershell
cd frontend
corepack yarn install
corepack yarn expo start --web --port 3000 --clear
```

For device testing with Expo Go, use the same `EXPO_PUBLIC_BACKEND_URL=http://tmffinance.com`; native requests are not blocked by browser CORS.
