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

/** Dense id → short register form, e.g. "#517e0b6b". */
export function shortId(id: string): string {
  const bare = id.startsWith("#") ? id.slice(1) : id;
  return `#${bare.slice(0, 8)}`;
}

/** Provider reference → short form, e.g. "0YK41054…". */
export function shortRef(ref: string): string {
  return ref.length > 10 ? `${ref.slice(0, 8)}…` : ref;
}

/**
 * Mask an email for display: first character of the local part, bullets, full
 * domain. A privacy tool should not broadcast its owner's address on every
 * screen; the full address stays available on hover via the title attribute.
 * Non-email strings are returned unchanged — no invented masking rules.
 */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0 || email.length === 0) return email;
  return `${email[0]}•••••${email.slice(at)}`;
}

/** Fingerprint → short form, e.g. "9c2d…e481". */
export function shortFingerprint(fingerprint: string): string {
  return fingerprint.length > 12
    ? `${fingerprint.slice(0, 4)}…${fingerprint.slice(-4)}`
    : fingerprint;
}