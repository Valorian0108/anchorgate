/**
 * PayPal error description (Phase 4).
 *
 * The PayPal SDK throws errors whose `message` is often EMPTY, with the real
 * reason in `statusCode` + a structured `result` body (e.g. a 403
 * `NOT_AUTHORIZED`). Blindly printing `error.message` therefore yields nothing
 * useful — which is exactly what happened during the first live Sandbox run.
 *
 * This produces a bounded, safe summary for logs and user-facing failure
 * reasons. It NEVER includes request data or credentials, only the provider's
 * own status/error text and debug id.
 */

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Turn a PayPal error body into a short "CODE: message (debug_id ...)". */
function summarizeBody(raw: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Not JSON; return a bounded slice so callers still see something.
    return raw.trim().slice(0, 300) || null;
  }
  if (!isObject(parsed)) return null;

  const bits: string[] = [];
  if (typeof parsed.name === "string" && parsed.name) bits.push(parsed.name);
  if (typeof parsed.message === "string" && parsed.message) bits.push(parsed.message);
  if (Array.isArray(parsed.details)) {
    for (const detail of parsed.details) {
      if (isObject(detail) && typeof detail.description === "string" && detail.description) {
        bits.push(detail.description);
      }
    }
  }

  const unique = [...new Set(bits)];
  const joined = unique.join(": ");
  if (!joined) return null;
  const debugId = typeof parsed.debug_id === "string" ? parsed.debug_id : undefined;
  return debugId ? `${joined} (debug_id ${debugId})` : joined;
}

/**
 * A safe, human-readable summary of a thrown PayPal (or generic) error.
 * Example: `HTTP 403 - NOT_AUTHORIZED: Authorization failed due to insufficient
 * permissions. (debug_id f185126c914b4)`.
 */
export function describePayPalError(error: unknown): string {
  if (!isObject(error)) {
    return String(error).slice(0, 300) || "Unknown error";
  }

  const parts: string[] = [];
  if (typeof error.statusCode === "number") parts.push(`HTTP ${error.statusCode}`);

  const body = error.result ?? error.body;
  const fromBody =
    typeof body === "string"
      ? summarizeBody(body)
      : isObject(body)
        ? summarizeBody(JSON.stringify(body))
        : null;

  const detail =
    fromBody ??
    (typeof error.message === "string" && error.message.trim()
      ? error.message.trim()
      : typeof error.name === "string" && error.name !== "Error"
        ? error.name
        : "Unknown PayPal error");

  return `${[...parts, detail].join(" - ")}`.slice(0, 500);
}
