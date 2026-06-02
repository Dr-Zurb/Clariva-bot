// Lint-fixture for the cv2-01 ESLint rule.
//
// This file is INTENTIONALLY a violation: it imports `ResizablePanelGroup`
// from the shadcn wrapper and mounts it directly. Production code under
// `components/`, `app/`, `hooks/`, and `lib/` is forbidden from doing this
// — only `components/patient-profile/Shell.tsx` and the wrapper itself
// (`components/ui/resizable.tsx`) are exempt.
//
// CI lint excludes this file via `.eslintignore` so the violation is
// suppressed in normal runs. To verify the rule fires:
//
//   pnpm --filter frontend lint -- --no-ignore tools/eslint-fixtures/bad-resizable.tsx
//
// Expected output (one error):
//
//   tools/eslint-fixtures/bad-resizable.tsx
//     8:3  Error: cv2-01: <ResizablePanelGroup> must only be mounted
//                  inside <PatientProfileShell> (Shell.tsx). …
//                                                  no-restricted-syntax
//
// If this file ever stops triggering the rule, the cv2-01 enforcement is
// broken — investigate before assuming the fixture went stale.

import { ResizablePanelGroup } from "@/components/ui/resizable";

export function BadPanelGroupOutsideShell() {
  return <ResizablePanelGroup orientation="horizontal" />;
}
