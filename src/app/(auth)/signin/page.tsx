import { SignInForm } from "@/components/sign-in-form";

/**
 * The sign-in page — port of design-research/signin.comp.html.
 *
 * A Server Component. The masthead lives in the (auth) layout; this page owns
 * the statement, the trust lines and the slip. `searchParams` carries the only
 * thing the server tells the browser about a refusal: a short reason word.
 */

function reasonNotice(reason: string | undefined): string | null {
  switch (reason) {
    case "timeout":
      return "Your session expired after 30 minutes idle. Sign in again to continue.";
    case "not-owner":
      return "That account is not the owner. This gate opens for the owner only.";
    case "link":
      return "That sign-in link was invalid, expired, or already used.";
    case "provider":
      return "Google sign-in is not enabled for this project yet. Use the email link.";
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
      <div className="headline">Identity · Owner · {today()}</div>

      <section className="split">
        <div className="left">
          <h1>The gate opens for one human. You.</h1>

          {notice ? (
            <p className="notice" role="alert">
              {notice}
            </p>
          ) : null}

          <div className="trust">
            <div className="trust-line">
              <span className="sq" />
              <span>
                The hard cap — 100.00 a month — sits above any approval. No
                model, and no button, can move it.
              </span>
            </div>
            <div className="trust-line">
              <span className="sq" />
              <span>
                Every decision runs against rules read fresh — never cached —
                the moment it is made.
              </span>
            </div>
            <div className="trust-line">
              <span className="sq" />
              <span>
                Your approve and decline are stamped with your identity in the
                Record, next to the timestamp.
              </span>
            </div>
          </div>
        </div>

        <SignInForm />
      </section>

      <footer>
        <span>identity · owner · demo data</span>
        <span>decisions stamped in the record · approvedBy / rejectedBy</span>
      </footer>
    </div>
  );
}
