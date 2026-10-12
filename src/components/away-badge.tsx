"use client";

import { useFeed } from "./feed-provider";

/**
 * "Gate · N new" — the quiet count of requests that arrived while the person
 * was elsewhere. Renders nothing at zero, so it is absent until it means
 * something. The browser tab title carries the same count (see FeedProvider).
 */
export function AwayBadge() {
  const { unseen } = useFeed();
  if (unseen === 0) return null;

  return (
    <span className="away-badge" role="status">
      Gate · {unseen} new
    </span>
  );
}
