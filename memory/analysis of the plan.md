The updated plan is **much better and now solid enough to start**, especially because it adds PR 00A, production-data safety rules, read-only gating for incomplete modules, email-only remember-me, no school hard delete, and the PR 03A/03B split. Those were the biggest risks in the first version. 

I would approve the plan **with a few final edits before implementation**.

## Remaining issues to fix in the plan

### 1. PR 00A should also remove production/demo leakage

In the uploaded mobile app, the login screen still shows a demo credential hint:

```txt
Demo: demo@feasibility.io / demo1234
```

Add this to **PR 00A**:

```md
- Remove or environment-gate demo credential hints from the production mobile login screen.
```

Also, `LogBox.ignoreAllLogs(true)` is currently in `frontend/app/_layout.tsx`. That hides real runtime problems during mobile QA.

Add:

```md
- Remove global `LogBox.ignoreAllLogs(true)` or enable it only for local demo mode.
```

### 2. PR 00A should add `.env.example`

Current `.env.local` has:

```env
EXPO_PUBLIC_BACKEND_URL=http://tmffinance.com
```

That is fine locally, but `.env.local` is ignored. Add an example file so Codex/devs know the expected value:

```md
- Add `frontend/.env.example` with:
  - `EXPO_PUBLIC_BACKEND_URL=http://tmffinance.com`
```

Also add a guard in API client so this does not happen accidentally:

```txt
http://tmffinance.com/api/api
```

Recommended PR 00 item:

```md
- Normalize `EXPO_PUBLIC_BACKEND_URL` so both `http://tmffinance.com` and `http://tmffinance.com/api` resolve correctly without duplicate `/api`.
```

### 3. PR 01 must include general protected-route guarding

The plan mentions `must_reset_password` route guard, which is good. But mobile currently does not have a strong protected-route shell. Direct navigation to `/schools`, `/admin/users`, `/scenario/...` should not rely only on each screen failing API calls.

Add to PR 01:

```md
- Add a protected-route guard for all authenticated app routes.
- Redirect unauthenticated users to `/login`.
- Redirect authenticated users with `must_reset_password` to `/profile`.
```

### 4. PR 02 close/reopen should be admin-only unless backend changes

The plan says “close/reopen where role/permissions allow.” That is okay, but the current backend close/reopen route is under:

```txt
PATCH /admin/schools/:schoolId
```

So mobile should not expose close/reopen to manager/accountant unless backend support is intentionally added.

Add:

```md
- School close/reopen currently uses admin route `/admin/schools/:schoolId`; do not expose it to manager/accountant unless backend support is added.
```

### 5. PR 03A/03B must include HQ scenario workflow exception

The backend/web has this important rule:

```js
HQ_REQUIRED_WORK_IDS = [
  "ik.local_staff",
  "gelirler.unit_fee",
  "giderler.isletme"
]
```

For HQ/headquarter scenarios, Temel Bilgiler, Kapasite, and Norm are not required the same way.

Add to PR 03A/03B:

```md
- Respect HQ/headquarter scenario required-work-id behavior:
  - normal scenario requires all base work IDs;
  - HQ scenario requires only `ik.local_staff`, `gelirler.unit_fee`, and `giderler.isletme`.
```

This is important for progress, submit/send-for-approval, and blocker messages.

### 6. PR 04C should be careful with Grades permissions

Your PR 04C combines Kapasite and Grades basics. That can work, but Grades does **not** map only to Kapasite permissions. The web/backend uses separate permission resources like:

```txt
page.grades_plan
section.grades_plan.plan
```

So add:

```md
- When porting GradesEditor, track `grades_plan` permissions separately from `kapasite`.
- Do not send only `section.kapasite.caps` for grade/branch plan changes.
```

Otherwise non-admin saves may fail or be authorized incorrectly.

### 7. PR 05A norm endpoint should include scenarioId

The plan says:

```md
Use `/schools/:schoolId/norm-config`.
```

But the web API uses optional scenario context:

```txt
/schools/:schoolId/norm-config?scenarioId=:scenarioId
```

Update PR 05A:

```md
- Use `/schools/:schoolId/norm-config?scenarioId=:scenarioId` when editing scenario-specific norm config.
```

### 8. PR 07 exports need mobile dependencies

The current mobile `package.json` does not appear to include export/share helpers like `expo-file-system` or `expo-sharing`.

PR 07 should explicitly include this decision:

```md
- Add native export/share dependencies if needed, such as `expo-file-system` and `expo-sharing`.
- Keep web export behavior separate from native file sharing behavior.
```

### 9. PR 10 manager dashboard should check permission, not only role

Manager permission routes require permission such as:

```txt
page.manage_permissions write
```

So the manager home should not show permission-management routes just because `role === "manager"`.

Add to PR 01 or PR 10:

```md
- Manager dashboard actions must be permission-aware, not role-only.
- Hide or disable manager permissions/review actions when required permission is missing.
```

## Final recommendation

The plan is now **good to implement starting with PR 00A**, but I would add the above 9 edits first.

The most important remaining additions are:

```md
1. Remove demo credential hint and global LogBox suppression.
2. Add protected-route guard for all authenticated routes.
3. Add HQ required-work-id exception.
4. Separate Grades permissions from Kapasite.
5. Use `norm-config?scenarioId=...`.
6. Make manager dashboard permission-aware.
```

After those changes, the sequence is solid: **PR 00A → PR 00 → PR 01 → PR 02 → PR 03A → PR 03B** is the right order.
