import type { PublicToolName } from "./api.js";

/**
 * Traveller-oriented projection of public-route results. The public MCP is an
 * anonymous, conversational channel: it answers a traveller's question, it is
 * not a bulk data feed (that is the keyed REST API). Envelope, country
 * metadata, nationality lists, entry points and long HTML texts are dropped.
 * Unknown shapes are returned unchanged.
 */

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

/** Drops null, undefined and empty strings so the agent only sees real facts. */
function clean(o: Obj): Obj {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== "")
  );
}

function unwrap(data: unknown): Obj | null {
  if (!isObj(data)) return null;
  return isObj(data.data) ? data.data : data;
}

function countryName(destination: unknown): unknown {
  if (!isObj(destination)) return destination;
  return isObj(destination.name) ? destination.name.common : destination.name;
}

function reasonLabels(reasons: unknown): unknown {
  return isObj(reasons) ? Object.values(reasons) : undefined;
}

function entries(multiple: unknown): string | undefined {
  if (multiple === 0) return "single";
  if (multiple === 1) return "multiple";
  return undefined;
}

function compactVisaSummary(v: Obj): Obj {
  return clean({
    id: v.id,
    name: v.name,
    type: v.type,
    description: v.description,
    reasons: reasonLabels(v.reasons),
    stay_duration_days: v.stay_duration,
    validity_days: v.validity_duration,
    consular_fee: v.consular_fee,
    consular_currency: v.consular_currency,
    entries: entries(v.multiple_entries),
    is_digital: v.is_digital,
    visa_on_arrival: v.has_visa_on_arrival === true ? true : undefined,
  });
}

function compactVisa(v: Obj): Obj {
  const destination = isObj(v.destination) ? v.destination : {};
  const documents = Array.isArray(v.documents)
    ? v.documents.filter(isObj).map((d) =>
        clean({ name: d.name, details: d.specificity, mandatory: d.is_mandatory })
      )
    : undefined;
  return clean({
    ...compactVisaSummary(v),
    destination: countryName(destination),
    min_age: v.min_age,
    max_age: v.max_age,
    passport_validity_months: destination.passport_validity_duration,
    documents,
  });
}

export function compactPublicResponse(toolName: PublicToolName, data: unknown): unknown {
  const d = unwrap(data);
  if (!d) return data;

  switch (toolName) {
    case "get_visa":
      return isObj(d.visa) ? compactVisa(d.visa) : data;
    case "list_visas":
      return Array.isArray(d.visas)
        ? { visas: d.visas.filter(isObj).map(compactVisaSummary) }
        : data;
    case "get_vaccines":
      return Array.isArray(d.vaccines)
        ? clean({
            destination: countryName(d.destination),
            vaccines: d.vaccines
              .filter(isObj)
              .map((x) => clean({ name: x.name, type: x.type, comment: x.comment })),
          })
        : data;
    case "get_customs":
      return isObj(d.customs)
        ? clean({ destination: countryName(d.destination), customs: d.customs })
        : data;
    case "get_visa_requirements": {
      if (!("requirement" in d)) return data;
      const i18n = isObj(d.i18n) ? d.i18n : {};
      const nationality = isObj(i18n.nationality) ? i18n.nationality.demonym : undefined;
      const dest = isObj(i18n.destination) && isObj(i18n.destination.country)
        ? i18n.destination.country.name
        : undefined;
      return clean({ requirement: d.requirement, nationality, destination: dest });
    }
    default:
      return data;
  }
}
