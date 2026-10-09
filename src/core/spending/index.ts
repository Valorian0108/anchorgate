/**
 * Public surface of the spending-accounting core.
 */

export type {
  SpendingEvent,
  SpendingEventKind,
  SpendingPeriod,
  SpendingSummary,
} from "./types";
export { SPENDING_EVENT_KINDS } from "./types";
export {
  capturedMinorIn,
  isMoneyAffecting,
  SpendingLedger,
  summarizeSpending,
} from "./ledger";
export type { RecordOutcome } from "./ledger";
export {
  captureEventId,
  parseSpendingEvent,
} from "./validation";
export { InMemorySpendingStore } from "./store";
export type { SpendingStore } from "./store";
