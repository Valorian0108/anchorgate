/**
 * Durable store for PayPal's signed webhook notifications.
 *
 * PayPal tells us when a capture completes; we verify the notification's
 * signature against PayPal's public certificate before we trust it, and keep
 * the signed event so a record page can show PayPal's word alongside ours.
 *
 * `transmission_id` is the idempotency key: the same notification delivered
 * twice is stored once.
 */

import { and, desc, eq } from "drizzle-orm";

import type { AppDatabase } from "./client";
import { paypalWebhookEvents } from "./schema";

export interface StoredWebhookEvent {
  id: number;
  transmissionId: string;
  captureId: string;
  eventType: string;
  resource: unknown;
  transmission: unknown;
  verified: boolean;
  verification: unknown | null;
  receivedAt: Date;
}

export class DrizzleWebhookStore {
  constructor(private readonly db: AppDatabase) {}

  /** Store a verified notification. Idempotent by transmission id. */
  async record(input: {
    transmissionId: string;
    captureId: string;
    eventType: string;
    resource: unknown;
    transmission: unknown;
    verified: boolean;
    verification: unknown | null;
  }): Promise<boolean> {
    const inserted = await this.db
      .insert(paypalWebhookEvents)
      .values({
        transmissionId: input.transmissionId,
        captureId: input.captureId,
        eventType: input.eventType,
        resource: input.resource,
        transmission: input.transmission,
        verified: input.verified,
        verification: input.verification,
        receivedAt: new Date(),
      })
      .onConflictDoNothing({ target: paypalWebhookEvents.transmissionId })
      .returning({ id: paypalWebhookEvents.id });
    return inserted.length > 0;
  }

  /** The most recent stored notification for a capture, if any exists. */
  async findByCapture(captureId: string): Promise<StoredWebhookEvent | null> {
    const rows = await this.db
      .select()
      .from(paypalWebhookEvents)
      .where(eq(paypalWebhookEvents.captureId, captureId))
      .orderBy(desc(paypalWebhookEvents.receivedAt))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      transmissionId: row.transmissionId,
      captureId: row.captureId,
      eventType: row.eventType,
      resource: row.resource,
      transmission: row.transmission,
      verified: row.verified,
      verification: row.verification,
      receivedAt: row.receivedAt,
    };
  }
}
