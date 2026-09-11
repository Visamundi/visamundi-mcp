import { describe, expect, it } from "vitest";
import { sanitizePublicResponse } from "./api.js";

describe("sanitizePublicResponse", () => {
  it("redacts public-sensitive token and internal fields recursively", () => {
    const sanitized = sanitizePublicResponse("get_visa", {
      credential_id: "cred-1",
      destination: {
        cca2: "TH",
      },
      nested: {
        internal_notes: "do not expose",
        partner_token: "secret",
      },
      items: [
        {
          id: 1,
          token: "abc",
          keep: true,
        },
      ],
    });

    expect(sanitized).toEqual({
      destination: {
        cca2: "TH",
      },
      nested: {},
      items: [
        {
          id: 1,
          keep: true,
        },
      ],
    });
  });
});
