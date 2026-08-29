/** Desktop row — text-sm (20) + py-2 (16) + 1px border. */
export const DESK_SEARCH_ROW_PX = 37;
export const DESK_SEARCH_HEADER_PX = 33;
/** Mobile card row. */
export const DESK_SEARCH_MOBILE_ROW_PX = 88;
export const DESK_SEARCH_MIN_PAGE = 1;
export const DESK_SEARCH_MAX_PAGE = 30;
export const DESK_SEARCH_FALLBACK_PAGE = 12;

/** How many result rows fit in the list pane without scrolling. */
export function deskSearchPageSizeFromHeight(
  heightPx: number,
  rowPx: number = DESK_SEARCH_ROW_PX,
  headerPx: number = DESK_SEARCH_HEADER_PX
): number {
  const usable = Math.max(0, heightPx - headerPx - 4);
  const n = Math.floor(usable / Math.max(1, rowPx));
  return Math.min(DESK_SEARCH_MAX_PAGE, Math.max(DESK_SEARCH_MIN_PAGE, n));
}

export function deskSearchPageCount(total: number, pageSize: number): number {
  if (total <= 0 || pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Last visible row index for "Showing A–B of C", using rows on screen. */
export function deskSearchVisibleEnd(
  page: number,
  pageSize: number,
  visibleCount: number,
  total: number
): number {
  if (total <= 0) return 0;
  return Math.min((page - 1) * pageSize + visibleCount, total);
}

/** Page buttons for a 1 2 3 … N control. */
export function deskSearchPageNumbers(
  current: number,
  last: number
): Array<number | "ellipsis"> {
  if (last <= 1) return [1];
  if (last <= 7) {
    return Array.from({ length: last }, (_, i) => i + 1);
  }
  const wanted = new Set([1, last, current, current - 1, current + 1]);
  const sorted = [...wanted].filter((page) => page >= 1 && page <= last).sort((a, b) => a - b);
  const out: Array<number | "ellipsis"> = [];
  for (let i = 0; i < sorted.length; i += 1) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push("ellipsis");
    out.push(sorted[i]);
  }
  return out;
}
