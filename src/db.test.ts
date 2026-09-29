import { describe, expect, it, vi } from "vitest";
import { summarizeTravelerStatuses } from "./db.js";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("pg", () => ({
  Client: class {
    connect = vi.fn();
    end = vi.fn(async () => undefined);
    query = query;
  },
}));

const { createDatabaseApi } = await import("./db.js");

describe("summarizeTravelerStatuses", () => {
  it("returns the shared status when all travelers agree", () => {
    expect(
      summarizeTravelerStatuses(["document_issued", "document_issued"])
    ).toEqual({
      processing_status: "document_issued",
      traveler_status_counts: { document_issued: 2 },
    });
  });

  it("returns mixed when travelers differ", () => {
    expect(summarizeTravelerStatuses(["paid", "to_process", "paid"])).toEqual({
      processing_status: "mixed",
      traveler_status_counts: { paid: 2, to_process: 1 },
    });
  });

  it("returns null when no status is known", () => {
    expect(summarizeTravelerStatuses([null])).toEqual({
      processing_status: null,
      traveler_status_counts: {},
    });
  });
});

describe("listTravelGroups", () => {
  it("adds traveler processing statuses to each group", async () => {
    query.mockReset();
    query
      .mockResolvedValueOnce({
        rows: [
          { travel_group_id: "g1", status: "draft" },
          { travel_group_id: "g2", status: "draft" },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { travel_group_id: "g1", statuses: ["document_issued", "document_issued"] },
          { travel_group_id: "g2", statuses: [] },
        ],
      });

    const rows = await createDatabaseApi("postgres://test").listTravelGroups(
      "cred",
      100,
      0
    );

    expect(query.mock.calls[1][1]).toEqual(["cred", ["g1", "g2"]]);
    expect(rows).toEqual([
      {
        travel_group_id: "g1",
        status: "draft",
        processing_status: "document_issued",
        traveler_status_counts: { document_issued: 2 },
      },
      {
        travel_group_id: "g2",
        status: "draft",
        processing_status: null,
        traveler_status_counts: {},
      },
    ]);
  });

  it("skips the status query when there are no groups", async () => {
    query.mockReset();
    query.mockResolvedValueOnce({ rows: [] });

    await expect(
      createDatabaseApi("postgres://test").listTravelGroups("cred")
    ).resolves.toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
