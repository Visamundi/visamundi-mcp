import { describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("pg", () => ({
  Client: class {
    connect = vi.fn();
    end = vi.fn(async () => undefined);
    query = query;
  },
}));

const { createDatabaseApi } = await import("./db.js");

describe("listTravelGroups", () => {
  it("returns the group rows without traveler statuses", async () => {
    query.mockReset();
    query.mockResolvedValueOnce({
      rows: [{ travel_group_id: "g1", status: "draft" }],
    });

    const rows = await createDatabaseApi("postgres://test").listTravelGroups(
      "cred",
      100,
      0
    );

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual(["cred", 100, 0]);
    expect(rows).toEqual([{ travel_group_id: "g1", status: "draft" }]);
  });
});
