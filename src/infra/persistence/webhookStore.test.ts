import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import type { AppDatabase } from "./client";
import { DrizzleWebhookStore } from "./webhookStore";
import * as schema from "./schema";

const MIGRATIONS = { migrationsFolder: "./drizzle" };

let client: PGlite;
let db: AppDatabase;

beforeAll(async () => {
  client = new PGlite();
  db = drizzle(client, { schema });
  await migrate(db, MIGRATIONS);
}, 30_000);

afterAll(async () => {
  await client.close();
});

describe("DrizzleWebhookStore", () => {
  test("stores a notification and finds it by capture id", async () => {
    const store = new DrizzleWebhookStore(db);

    const stored = await store.record({
      transmissionId: "wh-tx-1",
      captureId: "85L31139U0002064K",
      eventType: "PAYMENT.CAPTURE.COMPLETED",
      resource: { id: "85L31139U0002064K", status: "COMPLETED" },
      transmission: { webhookId: "wh-id" },
      verified: true,
      verification: { verification_status: "SUCCESS" },
    });
    expect(stored).toBe(true);

    const found = await store.findByCapture("85L31139U0002064K");
    expect(found).not.toBeNull();
    expect(found!.captureId).toBe("85L31139U0002064K");
    expect(found!.verified).toBe(true);
  });

  test("returns null when nothing matches", async () => {
    const store = new DrizzleWebhookStore(db);
    expect(await store.findByCapture("nope")).toBeNull();
  });

  test("ignores a duplicate transmission id", async () => {
    const store = new DrizzleWebhookStore(db);
    await store.record({
      transmissionId: "wh-tx-2",
      captureId: "WH-1",
      eventType: "PAYMENT.CAPTURE.COMPLETED",
      resource: { id: "WH-1" },
      transmission: {},
      verified: true,
      verification: null,
    });
    const again = await store.record({
      transmissionId: "wh-tx-2",
      captureId: "WH-1",
      eventType: "PAYMENT.CAPTURE.COMPLETED",
      resource: { id: "WH-1" },
      transmission: {},
      verified: false,
      verification: null,
    });
    expect(again).toBe(false);
  });
});
