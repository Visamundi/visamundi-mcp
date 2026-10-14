import { describe, expect, it } from "vitest";
import { compactPublicResponse } from "./publicCompact.js";

const envelope = (data: unknown) => ({ success: true, statusCode: 200, code: "ok", data });

const destination = {
  name: { prefix: "en", common: "Thaïlande", suffix: "", official: "Royaume de Thaïlande" },
  cca2: "TH",
  cca3: "THA",
  demonyms: { M: "Thaïlandais" },
  passport_validity_duration: 6,
  passport_validity_condition: "country-departure-date",
  submitting_case_deadline: 2,
};

describe("compactPublicResponse", () => {
  it("get_visa keeps what a traveller needs and drops bulk lists", () => {
    const out = compactPublicResponse(
      "get_visa",
      envelope({
        visa: {
          id: 42629,
          name: "TDAC",
          type: "arrival-card",
          destination,
          documents: [
            { name: "Passport", specificity: "", slug: "passport", type: "individual", is_mandatory: true },
            { name: "Flight", specificity: "return ticket", slug: "flight", type: "shared", is_mandatory: false },
          ],
          allowed_nationalities: { AFG: "Afghanistan", FRA: "France" },
          allowed_birthplaces: { AFG: "Afghanistan" },
          consular_fee: 0,
          consular_currency: "",
          stay_duration: 90,
          validity_duration: null,
          min_age: null,
          max_age: 17,
          is_digital: true,
          multiple_entries: null,
          reasons: { tourism: "Tourisme", business: "Affaires" },
          policies: [],
          entrypoints: { count: { airport: 0 }, items: null },
          immediate_processing: false,
          weekend_issuance: false,
          release_date: "0000-00-00",
        },
      })
    );

    expect(out).toEqual({
      id: 42629,
      name: "TDAC",
      type: "arrival-card",
      destination: "Thaïlande",
      reasons: ["Tourisme", "Affaires"],
      stay_duration_days: 90,
      consular_fee: 0,
      max_age: 17,
      is_digital: true,
      passport_validity_months: 6,
      documents: [
        { name: "Passport", mandatory: true },
        { name: "Flight", details: "return ticket", mandatory: false },
      ],
    });
  });

  it("list_visas returns one short line per product, without documents", () => {
    const out = compactPublicResponse(
      "list_visas",
      envelope({
        visas: [
          {
            id: 42572,
            name: "Tourisme - Entrée Simple (TR)",
            description: "Visa électronique…",
            stay_duration: 60,
            validity_duration: 90,
            consular_fee: 35,
            consular_currency: "EUR",
            type: "electronic-visa",
            reasons: { tourism: "Tourisme" },
            documents: [{ name: "Passport" }],
            multiple_entries: 0,
            is_digital: true,
            has_visa_on_arrival: false,
          },
        ],
      })
    );

    expect(out).toEqual({
      visas: [
        {
          id: 42572,
          name: "Tourisme - Entrée Simple (TR)",
          type: "electronic-visa",
          description: "Visa électronique…",
          reasons: ["Tourisme"],
          stay_duration_days: 60,
          validity_days: 90,
          consular_fee: 35,
          consular_currency: "EUR",
          entries: "single",
          is_digital: true,
        },
      ],
    });
  });

  it("get_vaccines drops the long HTML descriptions", () => {
    const out = compactPublicResponse(
      "get_vaccines",
      envelope({
        destination,
        vaccines: [
          { name: "Yellow Fever", slug: "yellow-fever", type: "needed", comment: "If arriving from…", description: "<p>long</p>" },
        ],
      })
    );

    expect(out).toEqual({
      destination: "Thaïlande",
      vaccines: [{ name: "Yellow Fever", type: "needed", comment: "If arriving from…" }],
    });
  });

  it("get_customs and get_visa_requirements drop the envelope and country metadata", () => {
    expect(
      compactPublicResponse("get_customs", envelope({ destination, customs: { alcohol: "1 l" } }))
    ).toEqual({ destination: "Thaïlande", customs: { alcohol: "1 l" } });

    expect(
      compactPublicResponse(
        "get_visa_requirements",
        envelope({
          requirement: "30",
          i18n: { nationality: { demonym: "Français" }, destination: { country: { name: "Thaïlande" } } },
        })
      )
    ).toEqual({ requirement: "30", nationality: "Français", destination: "Thaïlande" });
  });

  it("returns unknown shapes unchanged", () => {
    expect(compactPublicResponse("get_visa", { sanitized: true })).toEqual({ sanitized: true });
    expect(compactPublicResponse("list_visas", [{ id: 1 }])).toEqual([{ id: 1 }]);
  });
});
