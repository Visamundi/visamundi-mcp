import { describe, expect, it } from "vitest";
import {
  getPublicCircuitBreakerResponse,
  notePublicUpstreamFailure,
  resetPublicCircuitBreaker,
} from "./publicCircuitBreaker.js";

describe("publicCircuitBreaker", () => {
  it("opens briefly after upstream 429 responses", () => {
    resetPublicCircuitBreaker();
    notePublicUpstreamFailure(429, 1_000);

    expect(getPublicCircuitBreakerResponse(1_001)?.status).toBe(503);
    expect(getPublicCircuitBreakerResponse(31_001)).toBeNull();
  });
});
