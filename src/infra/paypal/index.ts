/**
 * Public surface of the PayPal infrastructure adapter.
 *
 * Everything here is server-side only and Sandbox-only.
 */

export { fromPayPalAmount, minorUnitExponent, toPayPalAmount } from "./money";
export type { PayPalOrdersPort, PayPalVaultPort } from "./ports";
export {
  createPayPalClient,
  readPayPalConfigFromEnv,
  SdkOrdersPort,
  SdkVaultPort,
  type PayPalConfig,
} from "./config";
export { buildCreateOrderBody, PayPalPaymentGateway } from "./gateway";
export type { PayPalPaymentGatewayDeps } from "./gateway";
export {
  completeVaultEnrollment,
  startVaultEnrollment,
  type CompleteVaultEnrollmentArgs,
  type StartVaultEnrollmentArgs,
  type VaultEnrollmentStart,
} from "./vault";
