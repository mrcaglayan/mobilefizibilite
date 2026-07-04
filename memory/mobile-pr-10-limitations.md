# Mobile PR 10 Limitations

## Scope Completed
- Added manager permission editor at `/manager/manage-permissions`.
- Added manager review queue at `/manager/review-queue`.
- Added manager school assignment route at `/manager/schools/[id]/assignments`.
- Manager dashboard actions are permission-aware:
  - user/permission management requires `page.manage_permissions:write`;
  - review queue is available for manager/accountant workflow users and non-admin users with `page.manage_permissions`.

## Deliberate Limits
- Review queue deep-links to the scenario shell with the relevant module tab selected when the user taps the module open action.
- Manager final admin approval is not duplicated here; final review remains in `/admin/approvals`.
- Manager permission editor hides `page.manage_permissions` because the backend does not allow managers to assign it.
- Assignment saves are replace-style and require confirmation before writing.

## QA Notes
- Test with a manager that has `page.manage_permissions:write`.
- Test with a manager/accountant that can view the review queue but cannot manage permissions.
- Confirm assignment payload modules remain backend display names such as `Temel Bilgiler`, `Kapasite`, `Norm`, `IK / HR`, `Gelirler`, and `Giderler`.
