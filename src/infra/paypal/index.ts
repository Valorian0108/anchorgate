/**
 * Public surface of the PayPal infrastructure adapter.
 *
 * Everything here is server-side only and Sandbox-only.
 */

export { fromPayPalAmount, minorUnitExponent, toPayPalAmount } from "./money";
export type {
  PayPalOrdersPort,
  PayPalPaymentsPort,
  PayPalVaultPort,
} from "./ports";
export {
  createPayPalClient,
  readPayPalConfigFromEnv,
  SdkOrdersPort,
  SdkPaymentsPort,
  SdkVaultPort,
  type PayPalConfig,
} from "./config";
export { buildCreateOrderBody, PayPalPaymentGateway } from "./gateway";
export type { PayPalPaymentGatewayDeps } from "./gateway";
export { describePayPalError } from "./errors";
export {
  completeVaultEnrollment,
  enrollCardVault,
  startVaultEnrollment,
  type CompleteVaultEnrollmentArgs,
  type EnrollCardVaultArgs,
  type StartVaultEnrollmentArgs,
  type VaultEnrollmentStart,
} from "./vault";
