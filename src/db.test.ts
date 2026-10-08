import { describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("pg", () => ({
  Client: class {
    connect = vi.fn();
    end = vi.fn(async () => undefined);
    query = query;
  },
}));

const { createDatabaseApi, matchesTravelGroupSearch } = await import("./db.js");

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

  it("finds groups by name, internal code or reference, then paginates", async () => {
    query.mockReset();
    query.mockResolvedValueOnce({
      rows: [
        { travel_group_id: "g1", group_name: "Paris trip", internal_code: null, reference: null },
        { travel_group_id: "g2", group_name: "TEST_CA-001", internal_code: "TEST_CA-001", reference: null },
        { travel_group_id: "g3", group_name: null, internal_code: null, reference: "test_ca-002" },
      ],
    });

    const rows = await createDatabaseApi("postgres://test").listTravelGroups(
      "cred",
      1,
      1,
      " test_ca "
    );

    expect(query.mock.calls[0][1]).toEqual(["cred", 1000, 0]);
    expect(rows.map((row) => row.travel_group_id)).toEqual(["g3"]);
  });

  it("ignores missing values when matching", () => {
    expect(
      matchesTravelGroupSearch(
        { group_name: null, internal_code: null, reference: null },
        "x"
      )
    ).toBe(false);
  });
});
