/**
 * Placeholder page.
 *
 * This is NOT the product interface. The UI has not been designed or approved
 * yet (see architecture.md, Phase 6 / OPEN-DECISIONS.md). This page exists only
 * so the Next.js project is runnable. It carries no design decisions.
 */
export default function Home() {
  return (
    <main>
      <h1>Spending authorization</h1>
      <p>
        Project scaffold only. The interface has not been designed and is
        intentionally not built yet.
      </p>
      <p>
        The authorization engine lives in <code>src/core/authorization</code>{" "}
        and is exercised by <code>npm test</code>.
      </p>
    </main>
  );
}
