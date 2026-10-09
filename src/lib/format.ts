/**
 * Formatting helpers for display. Money is integer minor units in the core;
 * we render it as fixed-decimal text here. All times are rendered from ISO.
 */

/** Minor units → "12.00" (fixed two decimals, no symbol). */
export function money(minor: number): string {
  return (minor / 100).toFixed(2);
}

/** Minor units → "$12.00" — used only in prose contexts. */
export function moneyWithSymbol(minor: number, currency: string): string {
  const symbol = currency === "USD" ? "$" : `${currency} `;
  return `${symbol}${money(minor)}`;
}

/** ISO time → "09:13:04" (local). */
export function fmtClock(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** ISO time → "09:13:04 UTC". */
export function fmtClockUTC(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UTC`;
}

/** ISO time → "09 oct" (local). */
export function fmtDay(iso: string): string {
  return new Date(iso)
    .toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
    .replace(" ", " ");
}

/** ISO time → short label: "09:13:04" when today, else "09 oct". */
export function fmtWhen(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  return sameDay ? fmtClock(iso) : fmtDay(iso);
}

/** Display id: keep as-is (records carry dense ids); prefix "#" only when absent. */
export function displayId(id: string): string {
  return id.startsWith("#") ? id : `#${id}`;
}