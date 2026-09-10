function toStructuredContent(
  result: unknown
): Record<string, unknown> | undefined {
  if (result === null || typeof result !== "object") {
    return undefined;
  }

  if (Array.isArray(result)) {
    return { items: result };
  }

  return result as Record<string, unknown>;
}

export function toolResult(result: unknown) {
  const text = JSON.stringify(result, null, 2);

  return {
    content: [{ type: "text" as const, text }],
    structuredContent: toStructuredContent(result),
  };
}

export function toolError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Unknown error occurred";

  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}
