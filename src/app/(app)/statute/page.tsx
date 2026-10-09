// Placeholder — the Statute screen (rules) is the next slice.
export const dynamic = "force-dynamic";

export default async function StatutePage() {
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
        Statute · rule set
      </div>
      <h1 style={{ fontFamily: "var(--s)", fontStyle: "italic", fontWeight: 400, fontSize: 38, margin: 0 }}>
        The rules the agent can&apos;t move.
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
        next slice · live rules render here from the store
      </p>
    </section>
  );
}