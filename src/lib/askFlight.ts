/**
 * Is an ask in flight? (19 oct 2026)
 *
 * The ask box's answer returns as a router navigation: the action redirects
 * to its outcome URL and the sentence renders. The suggestion feed's heartbeat
 * polls a server action about every thirty seconds, and when one of its
 * requests is in flight at the moment the answer tries to land, the router
 * aborts the answer's navigation and only retries it on a later cycle.
 * Measured live on 19 oct 2026: a sentence the server produced in 19 seconds
 * took minutes to appear on screen. The ask box therefore raises this flag
 * when an ask is submitted and lowers it when the answer lands, and the
 * heartbeat stays quiet while the flag is up. Skipping a tick is free by the
 * feed's own contract: the server enforces the real arrival gap, the Gate
 * already shows the true state, and a missing tick is not worth an alarm.
 *
 * Client-side only. A module singleton rather than React context because the
 * two ends live in different trees (the ask box in the Gate page, the
 * heartbeat in the signed-in layout) and the reader runs inside a plain
 * interval callback with no hook in scope.
 */

let askInFlight = false;

/** Raised and lowered by the ask box's submit button. */
export function setAskInFlight(value: boolean): void {
  askInFlight = value;
}

/** True while an ask is running and its answer has not landed yet. */
export function isAskInFlight(): boolean {
  return askInFlight;
}
