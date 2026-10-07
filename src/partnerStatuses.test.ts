import { describe, expect, it } from "vitest";
import { toPartnerStatuses } from "./partnerStatuses.js";

describe("partner statuses", () => {
  it("shows a paid traveler as being processed by our team", () => {
    expect(
      toPartnerStatuses({
        travelers: [{ first_name: "Ana", backoffice_status: "paid" }],
      })
    ).toEqual({
      travelers: [{ first_name: "Ana", backoffice_status: "Currently being processed by our team" }],
    });
  });

  it("shows a to_process traveler as awaiting processing", () => {
    expect(toPartnerStatuses({ backoffice_status: "to_process" })).toEqual({
      backoffice_status: "Awaiting processing",
    });
  });

  it("relabels the group status", () => {
    expect(toPartnerStatuses([{ status: "draft" }])).toEqual([
      { status: "Drafting, submit for review" },
    ]);
  });

  it("uses invoice wording for invoices, nested or listed", () => {
    expect(
      toPartnerStatuses({
        travel_group: { status: "submitted" },
        invoices: [{ id: "i1", status: "paid" }],
      })
    ).toEqual({
      travel_group: { status: "Currently being processed by our team" },
      invoices: [{ id: "i1", status: "Paid" }],
    });
    expect(toPartnerStatuses([{ invoice_id: "i2", status: "sent" }])).toEqual([
      { invoice_id: "i2", status: "Sent, awaiting payment" },
    ]);
  });

  it("never returns an unknown code as-is", () => {
    expect(toPartnerStatuses({ status: "on_hold" })).toEqual({ status: "On hold" });
  });
});
