import { describe, expect, it } from "vitest";
import {
  assertAllowedPath,
  assertSingleCountryResponse,
  sanitizeResponse,
} from "./api.js";

describe("api helpers", () => {
  it("redacts service_level recursively", () => {
    const input = {
      service_level: "high",
      visa: {
        id: 123,
        service_level: "medium",
      },
      items: [{ service_level: "low", keep: true }],
    };

    expect(sanitizeResponse(input)).toEqual({
      visa: { id: 123 },
      items: [{ keep: true }],
    });
  });

  it("rejects non-whitelisted API paths", () => {
    expect(() => assertAllowedPath("/visas")).not.toThrow();
    expect(() => assertAllowedPath("/visa/42")).not.toThrow();
    expect(() => assertAllowedPath("/countries")).not.toThrow();
    expect(() => assertAllowedPath("/customs")).not.toThrow();
    expect(() => assertAllowedPath("/vaccines")).not.toThrow();
    expect(() => assertAllowedPath("/e/visa/requirements")).not.toThrow();
    expect(() => assertAllowedPath("/country")).toThrow("Path not allowed");
  });

  it("accepts a single-country response envelope", () => {
    expect(() =>
      assertSingleCountryResponse(
        {
          success: true,
          data: {
            destination: {
              cca2: "TH",
              cca3: "THA",
            },
          },
        },
        "th"
      )
    ).not.toThrow();
  });

  it("rejects unscoped bulk responses", () => {
    expect(() =>
      assertSingleCountryResponse(
        {
          success: true,
          data: [
            { country_code: "TH" },
            { country_code: "FR" },
          ],
        },
        "th"
      )
    ).toThrow("Response was not scoped to requested country TH.");
  });
});
