// Placeholder — the Record (audit register) is the next slice.
export const dynamic = "force-dynamic";

export default async function RecordPage() {
  return (
    <section style={{ paddingTop: 40 }}>
      <div
        style={{
          fontFamily: "var(--m)",
          fontSize: 11,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--ink-faint)",
          marginBottom: 12,
        }}
      >
        Record · audit register
      </div>
      <h1 style={{ fontFamily: "var(--s)", fontStyle: "italic", fontWeight: 400, fontSize: 38, margin: 0 }}>
        Every decision, written down.
      </h1>
      <p
        style={{
          fontFamily: "var(--m)",
          fontSize: 11,
          letterSpacing: "0.06em",
          color: "var(--ink-faint)",
          marginTop: 16,
        }}
      >
        next slice · the register renders live from the ledger
      </p>
    </section>
  );
}