const CIRCUIT_BREAKER_WINDOW_MS = 30_000;

let publicCircuitBreakerUntil = 0;

export function getPublicCircuitBreakerResponse(
  now = Date.now()
): Response | null {
  if (now < publicCircuitBreakerUntil) {
    return new Response(
      JSON.stringify({
        error: "service_unavailable",
        error_description: "Public MCP route is temporarily unavailable.",
      }),
      {
        status: 503,
        headers: {
          "content-type": "application/json",
        },
      }
    );
  }

  return null;
}

export function notePublicUpstreamFailure(
  status: number | undefined,
  now = Date.now()
): void {
  if (status === 429 || status === 503) {
    publicCircuitBreakerUntil = now + CIRCUIT_BREAKER_WINDOW_MS;
  }
}

export function resetPublicCircuitBreaker(): void {
  publicCircuitBreakerUntil = 0;
}
