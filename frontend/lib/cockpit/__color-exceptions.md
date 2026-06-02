# Cockpit color exceptions (cpv-06)

Documented literals that intentionally stay on the Tailwind default palette instead of semantic tokens.

| File | Classes | Reason |
|---|---|---|
| `components/cockpit/rx/inputs/VitalsGrid.tsx` | `bg-blue-100`, `bg-green-100`, `bg-amber-100`, `bg-red-100`, matching `text-*` / `border-*` | BMI category badge colors (cpv-03) — category-specific, not success/warning/destructive semantics |
