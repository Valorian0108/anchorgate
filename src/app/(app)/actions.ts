"use server";

/**
 * Gate actions (server-side only).
 *
 * The "Ask the assistant" box. The owner types what they want looked at; we run
 * the proposal-only agent and return to the Gate. The agent can only PROPOSE;
 * the deterministic engine still decides, and nothing is paid here.
 */

import { redirect } from "next/navigation";

import { verifyOwner } from "@/lib/auth/dal";
import { getAgent } from "@/lib/service";

export async function proposeFromGate(formData: FormData): Promise<void> {
  await verifyOwner();

  const text = String(formData.get("request") ?? "").trim();
  if (!text) {
    redirect("/?ask=empty");
  }

  // NOTE: redirect() throws, so it must happen OUTSIDE the try block or the
  // catch would swallow it and report an error on success.
  let ok = false;
  try {
    const agent = await getAgent();
    await agent.run(text);
    ok = true;
  } catch {
    ok = false;
  }

  redirect(ok ? "/?ask=done" : "/?ask=error");
}
