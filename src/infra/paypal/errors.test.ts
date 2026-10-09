import { describe as vitestDescribe, expect, it } from "vitest";

import { describePayPalError } from "./errors";

vitestDescribe("describePayPalError", () => {
  it("surfaces the status code and structured body when message is empty", () => {
    // Mirrors the real SDK error seen on the first live Sandbox run:
    // a 403 whose `message` is empty and whose reason is in `result`.
    const error = {
      name: "Error",
      message: "",
      statusCode: 403,
      result: {
        name: "NOT_AUTHORIZED",
        debug_id: "f185126c914b4",
        message: "Authorization failed due to insufficient permissions.",
        details: [
          {
            issue: "NOT_AUTHORIZED",
            description: "Authorization failed due to insufficient permissions.",
          },
        ],
      },
    };

    const text = describePayPalError(error);

    expect(text).toContain("HTTP 403");
    expect(text).toContain("NOT_AUTHORIZED");
    expect(text).toContain("Authorization failed due to insufficient permissions.");
    expect(text).toContain("debug_id f185126c914b4");
    // Duplicate issue/description lines are collapsed.
    expect(text.match(/NOT_AUTHORIZED/g)).toHaveLength(1);
  });

  it("uses a plain error message when present", () => {
    expect(describePayPalError(new Error("boom"))).toBe("boom");
  });

  it("falls back to the error name when the message is empty", () => {
    const error = new Error("");
    error.name = "ApiError";
    expect(describePayPalError(error)).toBe("ApiError");
  });

  it("handles non-object throwables safely", () => {
    expect(describePayPalError("oops")).toBe("oops");
  });

  it("accepts a string body that is not JSON", () => {
    const error = { statusCode: 500, body: "<html>upstream error</html>" };
    const text = describePayPalError(error);
    expect(text).toContain("HTTP 500");
    expect(text).toContain("upstream error");
  });

  it("never returns an empty string", () => {
    expect(describePayPalError({})).toBe("Unknown PayPal error");
  });
});
