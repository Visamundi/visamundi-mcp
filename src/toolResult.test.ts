import { describe, expect, it } from "vitest";
import { toolError, toolResult } from "./toolResult.js";

describe("toolResult", () => {
  it("wraps array results in an items object for structuredContent", () => {
    const result = toolResult([{ id: "1" }, { id: "2" }]);

    expect(result.structuredContent).toEqual({
      items: [{ id: "1" }, { id: "2" }],
    });
    expect(result.content[0]?.text).toContain('"id": "1"');
  });

  it("passes through object results unchanged", () => {
    expect(toolResult({ foo: "bar" }).structuredContent).toEqual({
      foo: "bar",
    });
  });

  it("omits structuredContent for primitives", () => {
    expect(toolResult("ok").structuredContent).toBeUndefined();
    expect(toolResult(42).structuredContent).toBeUndefined();
    expect(toolResult(null).structuredContent).toBeUndefined();
  });
});

describe("toolError", () => {
  it("returns an error payload without structuredContent", () => {
    const result = toolError(new Error("boom"));

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toBe("Error: boom");
    expect("structuredContent" in result).toBe(false);
  });
});
