/**
 * AnchorGate — the anchor mark. Our only icon. Stroke set owned by us.
 * Used in the masthead wordmark across the app.
 */
export function AnchorMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
      aria-hidden="true"
    >
      <path d="M12 4.5v15" />
      <path d="M6 10.5h12" />
      <path d="M6 10.5 4 17c1.6.8 4.3.8 5.8 0L6 10.5Z" />
      <path d="M18 10.5 16 17c-1.5-.8-4.2-.8-5.8 0L18 10.5Z" />
    </svg>
  );
}