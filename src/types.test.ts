import { describe, expect, it } from "vitest";
import {
  ALL_TOOL_NAMES,
  COMPANY_TOOL_NAMES,
  grantedPartnerTools,
} from "./types.js";

describe("grantedPartnerTools", () => {
  it("grants all 15 tools to an account with a company", () => {
    expect(grantedPartnerTools("company-1")).toEqual([...ALL_TOOL_NAMES]);
    expect(ALL_TOOL_NAMES).toHaveLength(15);
  });

  it("withholds company-scoped tools from an account without a company", () => {
    const granted = grantedPartnerTools(null);

    for (const tool of COMPANY_TOOL_NAMES) {
      expect(granted).not.toContain(tool);
    }
    expect(granted).toContain("get_processing_load");
    expect(granted).toContain("list_visas");
    expect(granted).toHaveLength(ALL_TOOL_NAMES.length - COMPANY_TOOL_NAMES.length);
  });
});
