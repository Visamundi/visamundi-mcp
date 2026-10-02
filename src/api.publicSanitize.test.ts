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

describe("sanitizePublicResponse provenance redaction", () => {
  it("drops update dates, authors and source fields recursively", () => {
    const sanitized = sanitizePublicResponse("list_visas", [
      {
        id: 7,
        name: "e-Visa",
        date_created: "2026-01-02T10:00:00Z",
        date_updated: "2026-03-04T10:00:00Z",
        user_created: "uuid-1",
        user_updated: "uuid-2",
        last_updated: "2026-03-04",
        last_checked_at: "2026-03-05",
        updated_at: "2026-03-04",
        verified_on: "2026-03-04",
        source: "gov.example",
        sources: ["a", "b"],
        source_url: "https://gov.example/visa",
        data_source: "scraper",
        validity_days: 90,
        processing_time: "3 days",
        documents: [{ name: "Passport", date_updated: "2026-01-01" }],
      },
    ]);

    expect(sanitized).toEqual([
      {
        id: 7,
        name: "e-Visa",
        validity_days: 90,
        processing_time: "3 days",
        documents: [{ name: "Passport" }],
      },
    ]);
  });
});
