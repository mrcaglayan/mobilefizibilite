# Mobile PR 00 Smoke Checklist

Run against the production backend contract:

```powershell
cd frontend
corepack yarn expo start --web --port 3000 --clear
```

Use `EXPO_PUBLIC_BACKEND_URL=http://tmffinance.com`.

## Required Checks

- Login with a real production user.
- Open `/schools`.
  - Schools load without local response-shape errors.
  - Empty assigned-school state is valid for users with no assignments.
- Open a school detail page.
  - Scenarios load from the real backend.
  - Scenario IDs work as numeric or string route params.
- Open a scenario detail page.
  - Inputs load without mutation.
  - Save button is read-only/gated.
  - MVP mobile fields are not saved to production scenario inputs.
- Open the report tab.
  - Real backend `{ results, cached, calculatedAt }` responses show a mobile summary when adaptable.
  - If adaptation is not possible, the report tab shows a clear disabled message.
- Open `/admin/users`.
  - User list loads through normalized API client response.
- Open `/admin/user/:id`.
  - User lookup uses normalized list response and does not show "Kullanıcı Bulunamadı" for existing users.
- Open `/admin/countries`.
  - Country list loads through normalized API client response.
- Open `/admin/approvals`.
  - Scenario queue and approval-batch queue load through API adapters.
- Open `/manager/users` with a manager that has required permission.
  - Manager user list loads through normalized API client response.

## Safety Checks

- No screen performs backend list-shape guessing such as `Array.isArray(res) ? res : res.users || []`.
- Scenario input saves without `modifiedResources` or `modifiedPaths` are blocked by the mobile client.
- No school hard-delete flow exists in mobile; close/reopen uses the admin school update route.
- Progress/status-style helpers use `noCache` support in the API client.
