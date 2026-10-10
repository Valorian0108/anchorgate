import { SignInForm } from "@/components/sign-in-form";

/**
 * The sign-in page.
 *
 * A Server Component. The masthead lives in the (auth) layout; this page owns
 * the statement, the trust lines and the slip. `searchParams` carries the only
 * thing the server tells the browser about a refusal: a short reason word.
 *
 * Voice: plain, warm, second person. No em dashes. No numbers we do not read
 * from the rules (the cap lives on the Gate and the Statute, not hardcoded here).
 */

function reasonNotice(reason: string | undefined): string | null {
  switch (reason) {
    case "timeout":
      return "You were signed out after 30 minutes of no activity. Sign in again to continue.";
    case "not-owner":
      return "That account is not the owner. This gate opens for the owner only.";
    case "link":
      return "That sign-in link did not work. It may be expired or already used. Try again.";
    case "provider":
      return "Google sign-in is not set up yet. Please use the email link.";
    default:
      return null;
  }
}

function today(): string {
  return new Date()
    .toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
    .toLowerCase();
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const notice = reasonNotice(reason);

  return (
    <div className="signin">
      <div className="headline reveal" style={{ "--i": 0 } as React.CSSProperties}>
        Owner sign-in · {today()}
      </div>

      <section className="split">
        <div className="left reveal" style={{ "--i": 1 } as React.CSSProperties}>
          <h1>This gate opens for one person. You.</h1>

          {notice ? (
            <p className="notice" role="alert">
              {notice}
            </p>
          ) : null}

          <div className="trust">
            <div className="trust-line">
              <span className="sq" />
              <span>
                Your monthly spending limit sits above every approval. No app, and
                no button, can raise it.
              </span>
            </div>
            <div className="trust-line">
              <span className="sq" />
              <span>
                Every decision is checked against your rules in the moment, never
                from memory.
              </span>
            </div>
            <div className="trust-line">
              <span className="sq" />
              <span>
                When you approve or decline, your name and the time are saved in the
                record.
              </span>
            </div>
          </div>
        </div>

        <div className="reveal" style={{ "--i": 2 } as React.CSSProperties}>
          <SignInForm />
        </div>
      </section>

      <footer className="reveal" style={{ "--i": 3 } as React.CSSProperties}>
        <span>Owner sign-in · demo data</span>
        <span>Every decision is saved with your name and the time</span>
      </footer>
    </div>
  );
}
