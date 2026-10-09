/**
 * PayPal money conversion (Phase 4).
 *
 * Our domain stores money as an INTEGER in currency minor units. PayPal's APIs
 * take a DECIMAL STRING (e.g. "5.00"). Converting between the two is
 * correctness-critical: a wrong exponent means over- or under-charging.
 *
 * Per ISO 4217, most currencies have 2 minor digits, some have 0, and a few have
 * 3. We keep an explicit list rather than guessing, and we fail closed for an
 * unknown currency rather than assume 2.
 *
 * No floating point is used anywhere.
 */

/** ISO 4217 currencies with zero minor digits. */
const ZERO_DECIMAL = new Set([
  "BIF", "CLP", "DJF", "GNF", "ISK", "JPY", "KMF", "KRW", "PYG", "RWF",
  "UGX", "UYI", "VND", "VUV", "XAF", "XOF", "XPF",
]);

/** ISO 4217 currencies with three minor digits. */
const THREE_DECIMAL = new Set(["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"]);

/** The number of minor digits for a currency. Fails closed for unknown codes. */
export function minorUnitExponent(currency: string): number {
  const code = currency.toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    throw new Error(`Unsupported currency code: ${JSON.stringify(currency)}.`);
  }
  if (ZERO_DECIMAL.has(code)) return 0;
  if (THREE_DECIMAL.has(code)) return 3;
  // Everything else in ISO 4217 that PayPal supports uses 2. A three-letter code
  // that is not in either special list is treated as 2.
  return 2;
}

/**
 * Convert an integer minor-unit amount to PayPal's decimal string.
 * Example (USD): 500 -> "5.00". Example (JPY): 500 -> "500".
 */
export function toPayPalAmount(amountMinor: number, currency: string): string {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new Error(`Amount must be a safe integer of minor units, got ${amountMinor}.`);
  }
  const exponent = minorUnitExponent(currency);
  const negative = amountMinor < 0;
  const digits = String(Math.abs(amountMinor)).padStart(exponent + 1, "0");
  const splitAt = digits.length - exponent;
  const whole = digits.slice(0, splitAt);
  const fraction = exponent === 0 ? "" : `.${digits.slice(splitAt)}`;
  return `${negative ? "-" : ""}${whole}${fraction}`;
}

/**
 * Convert a PayPal decimal string to integer minor units.
 * Fails closed if the value has more minor digits than the currency allows
 * (rather than silently rounding money).
 */
export function fromPayPalAmount(value: string, currency: string): number {
  const exponent = minorUnitExponent(currency);
  if (typeof value !== "string" || !/^-?\d+(\.\d+)?$/.test(value)) {
    throw new Error(`Invalid monetary value from provider: ${JSON.stringify(value)}.`);
  }
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
  if (fraction.length > exponent) {
    throw new Error(
      `Provider value ${JSON.stringify(value)} has more decimal places than ` +
        `${currency} allows (${exponent}).`,
    );
  }
  const paddedFraction = fraction.padEnd(exponent, "0");
  const minor = Number(`${whole}${paddedFraction}`);
  if (!Number.isSafeInteger(minor)) {
    throw new Error(`Provider amount ${JSON.stringify(value)} is out of range.`);
  }
  return negative ? -minor : minor;
}
