import { SignUpForm } from "@/components/sign-up-form";

/**
 * The sign-up page — create your own gate.
 *
 * A Server Component. The masthead lives in the (auth) layout; this page owns
 * the promise, the trust lines and the slip. Same voice as the sign-in page:
 * plain, warm, second person. No em dashes.
 */

function today(): string {
  return new Date()
    .toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })
    .toLowerCase();
}

export default function SignUpPage() {
  return (
    <div className="signin">
      <div className="headline reveal" style={{ "--i": 0 } as React.CSSProperties}>
        Create your gate · {today()}
      </div>

      <section className="split">
        <div className="left reveal" style={{ "--i": 1 } as React.CSSProperties}>
          <h1>Your own gate. Your own rules.</h1>

          <div className="trust">
            <div className="trust-line">
              <span className="sq" />
              <span>
                You set your monthly limit. Nothing can raise it except you,
                and every purchase waits for your okay before it can pay.
              </span>
            </div>
            <div className="trust-line">
              <span className="sq" />
              <span>
                Your rules, your record, and your card are yours alone. Nobody
                else&apos;s purchases ever appear here.
              </span>
            </div>
            <div className="trust-line">
              <span className="sq" />
              <span>
                Until you set your limit, nothing can be approved. That is the
                safe default.
              </span>
            </div>
          </div>
        </div>

        <div className="reveal" style={{ "--i": 2 } as React.CSSProperties}>
          <SignUpForm />
        </div>
      </section>

      <footer className="reveal" style={{ "--i": 3 } as React.CSSProperties}>
        <span>Create your gate · PayPal Sandbox only</span>
        <span>Every decision is saved with your name and the time</span>
      </footer>
    </div>
  );
}
