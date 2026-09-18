# Task sr-01: SettingsPageShell + useDoctorSettingsForm

> **Links:** [`../plan-settings-refresh-batch.md`](../plan-settings-refresh-batch.md) · [`./EXECUTION-ORDER-settings-refresh.md`](./EXECUTION-ORDER-settings-refresh.md)

## Overview

Shared load/save plumbing (SR-D1) so leaf pages stop hand-rolling session + fetch.

**Status:** 🔄 In progress

## Breakdown

- [ ] 1.1 `useDoctorSettingsForm(token, { toForm })` — wraps `useDoctorSettingsQuery`, local form + dirty, `save(payload)` via `patchDoctorSettings` + invalidate `queryKeys.opd.doctorSettings()`.
- [ ] 1.2 `SettingsPageShell` — title, description, loading skeleton, load-error alert, children.
- [ ] 1.3 Unit tests for form dirty/serialize helpers if extracted; otherwise cover via practice-info later.

## Files

```
CREATE: frontend/hooks/useDoctorSettingsForm.ts
CREATE: frontend/components/settings/SettingsPageShell.tsx
CREATE: frontend/hooks/__tests__/useDoctorSettingsForm.test.ts (optional if pure helpers)
```

## Acceptance

- [ ] Hook exposes settings, form, setForm, isDirty, saving, saveSuccess, saveError, save, isLoading, loadError, refetch.
- [ ] Shell uses semantic tokens only.
