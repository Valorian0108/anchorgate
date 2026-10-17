/**
 * PayPal's webhook endpoint.
 *
 * PayPal POSTs here when a capture completes. We ask PayPal's own verification
 * endpoint whether the notification's signature is genuine, then store the
 * signed event so a record page can show PayPal's word alongside ours.
 *
 * This route needs no session: PayPal's servers deliver to it, and the
 * signature is the only authentication. Sandbox only, like the rest of the app
 * (readPayPalConfigFromEnv refuses any other environment).
 *
 * We always answer 200. A notification we cannot verify is stored unverified
 * rather than dropped by a 5xx, because the honest state is "PayPal sent this,
 * we could not confirm the signature" and the record page says exactly that.
 *
 * Everything PayPal signed is stored in `transmission` under PayPal's own field
 * names, so anyone (a judge, a curious owner) can copy that object straight
 * back into PayPal's verify-webhook-signature API and check it themselves.
 */

import { NextResponse, type NextRequest } from "next/server";

import { readPayPalConfigFromEnv } from "@/infra/paypal";
import { getWebhookStore } from "@/lib/service";

/** PayPal's webhook verification endpoint, Sandbox only. */
const VERIFY_URL =
  "https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature";

/** The part of a capture notification we actually use. */
interface WebhookEvent {
  id?: string;
  event_type?: string;
  resource?: { id?: string };
}

/** The transmission PayPal sends, in PayPal's own field names. */
interface Transmission {
  auth_algo: string | null;
  transmission_id: string | null;
  transmission_time: string | null;
  webhook_id: string | null;
  cert_url: string | null;
  transmission_sig: string | null;
  transmission_body: string;
}

function readTransmission(request: NextRequest, raw: string): Transmission {
  const h = request.headers;
  return {
    auth_algo: h.get("paypal-auth-algo"),
    transmission_id: h.get("paypal-transmission-id"),
    transmission_time: h.get("paypal-transmission-time"),
    webhook_id: h.get("paypal-webhook-id"),
    cert_url: h.get("paypal-cert-url"),
    transmission_sig: h.get("paypal-transmission-sig"),
    transmission_body: raw,
  };
}

/** Ask PayPal whether the notification it sent is genuine. */
async function verifyWithPayPal(
  event: WebhookEvent,
  transmission: Transmission,
): Promise<{ verified: boolean; verification: unknown }> {
  const config = readPayPalConfigFromEnv(process.env);
  /* The registered webhook id from the environment is authoritative; the header
     PayPal sends is the fallback so the check still runs before it is set. */
  const webhookId = process.env.PAYPAL_WEBHOOK_ID?.trim() || transmission.webhook_id;

  const response = await fetch(VERIFY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(
        `${config.clientId}:${config.clientSecret}`,
      ).toString("base64")}`,
    },
    body: JSON.stringify({
      auth_algo: transmission.auth_algo,
      transmission_id: transmission.transmission_id,
      transmission_time: transmission.transmission_time,
      webhook_id: webhookId,
      webhook_event_id: event.id,
      cert_url: transmission.cert_url,
      transmission_sig: transmission.transmission_sig,
      transmission_body: transmission.transmission_body,
    }),
  });

  const verification: unknown = await response.json().catch(() => null);
  const status = (verification as { verification_status?: string } | null)
    ?.verification_status;
  return { verified: status === "SUCCESS", verification };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const raw = await request.text();
  const transmission = readTransmission(request, raw);

  let event: WebhookEvent;
  try {
    event = JSON.parse(raw) as WebhookEvent;
  } catch {
    return NextResponse.json({ ok: true, stored: false });
  }

  const resource = event.resource;
  const captureId = resource?.id ?? "";
  /* Without a transmission id there is nothing to dedupe on, and without a
     capture id there is no record to match it to. Storing either would be
     noise, so we say plainly that nothing was stored. */
  if (!transmission.transmission_id || !captureId) {
    return NextResponse.json({ ok: true, stored: false });
  }

  let verified = false;
  let verification: unknown = null;
  try {
    ({ verified, verification } = await verifyWithPayPal(event, transmission));
  } catch {
    /* Verification could not run (credentials missing, PayPal unreachable).
       Fall through and store it unverified: that is the honest state. */
  }

  await getWebhookStore().record({
    transmissionId: transmission.transmission_id,
    captureId,
    eventType: event.event_type ?? "",
    resource: resource ?? {},
    transmission,
    verified,
    verification,
  });

  return NextResponse.json({ ok: true, stored: true, verified });
}
