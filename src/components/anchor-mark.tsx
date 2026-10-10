/**
 * AnchorGate — the "Holdfast" anchor mark. Our only icon. Stroke set owned by us.
 * Used in the masthead wordmark across the app.
 *
 * Geometry: ring, shaft, stock, a curved crown and barbed flukes —
 * the classic "holds fast," drawn with confident weight.
 */
export function AnchorMark() {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="32" cy="17" r="6" />
      <path d="M32 23 V53" />
      <path d="M20 31 H44" />
      <path d="M14 37 Q21 51 32 53 Q43 51 50 37" />
      <path d="M14 37 l-4 8 l9 -3" />
      <path d="M50 37 l4 8 l-9 -3" />
    </svg>
  );
}
