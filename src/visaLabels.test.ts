import { describe, expect, it, vi } from "vitest";
import { createVisaLabeler, extractVisaLabel } from "./visaLabels.js";

const ETA_UK = {
  success: true,
  data: {
    visa: {
      id: 42617,
      name: "ETA Royaume-Uni",
      destination: { name: { common: "Royaume-Uni" }, cca2: "GB" },
    },
  },
};

describe("visa labels", () => {
  it("reads the visa and destination names from a Connect visa response", () => {
    expect(extractVisaLabel(ETA_UK)).toEqual({
      visa_name: "ETA Royaume-Uni",
      destination_name: "Royaume-Uni",
    });
    expect(extractVisaLabel(null)).toEqual({ visa_name: null, destination_name: null });
  });

  it("labels every record holding a document_id or visa_id, fetching each id once", async () => {
    const fetchVisa = vi.fn(async () => ETA_UK);
    const addVisaLabels = createVisaLabeler(fetchVisa);

    const result = await addVisaLabels(
      {
        items: [
          { travel_group_id: "a", document_id: "42617" },
          { travel_group_id: "b", document_id: "42617" },
          { travel_group_id: "c", document_id: null },
        ],
        window: { visa_id: 42617 },
      },
      "fr"
    );

    expect(fetchVisa).toHaveBeenCalledTimes(1);
    expect(fetchVisa).toHaveBeenCalledWith(42617, "fr");
    expect(result.items[0]).toMatchObject({
      visa_name: "ETA Royaume-Uni",
      destination_name: "Royaume-Uni",
    });
    expect(result.items[2]).not.toHaveProperty("visa_name");
    expect(result.window).toMatchObject({ visa_name: "ETA Royaume-Uni" });
  });

  it("returns records unlabeled when the lookup fails or no fetcher is configured", async () => {
    const rows = [{ document_id: "1" }];

    await expect(
      createVisaLabeler(vi.fn().mockRejectedValue(new Error("down")))(rows)
    ).resolves.toEqual(rows);
    await expect(createVisaLabeler(null)(rows)).resolves.toBe(rows);
  });
});
