/** Shared confirm copy when applying a template over a non-empty catalog editor (SFU-13 / SFU-14). */
export function confirmReplaceServiceCatalogIfNeeded(currentRowCount: number): boolean {
  if (currentRowCount <= 0) return true;
  return window.confirm(
    "Replace your entire services catalog with this template? Your current rows will be removed from the editor (you can cancel without saving)."
  );
}
