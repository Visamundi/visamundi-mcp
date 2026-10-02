// Partner records only carry a numeric visa id (`document_id` / `visa_id`).
// Agents must show visas by name and destination, never by id, so we attach
// readable labels from Connect before returning the record.

const VISA_ID_KEYS = ["document_id", "visa_id"] as const;

export interface VisaLabel {
  visa_name: string | null;
  destination_name: string | null;
}

export type FetchVisa = (id: number, language?: string) => Promise<unknown>;

export type AddVisaLabels = <T>(data: T, language?: string) => Promise<T>;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readVisaId(record: Record<string, unknown>): number | undefined {
  for (const key of VISA_ID_KEYS) {
    const value = record[key];
    const text = typeof value === "number" ? String(value) : value;
    if (typeof text === "string" && /^\d+$/.test(text.trim())) {
      return Number(text.trim());
    }
  }

  return undefined;
}

export function extractVisaLabel(response: unknown): VisaLabel {
  const root = asRecord(response);
  const visa = asRecord(asRecord(root?.data)?.visa) ?? asRecord(root?.visa);
  const destination = asRecord(visa?.destination);
  const destinationName = asRecord(destination?.name);

  return {
    visa_name: typeof visa?.name === "string" ? visa.name : null,
    destination_name:
      typeof destinationName?.common === "string" ? destinationName.common : null,
  };
}

function collectVisaIds(data: unknown, ids: Set<number>): void {
  if (Array.isArray(data)) {
    data.forEach((item) => collectVisaIds(item, ids));
    return;
  }

  const record = asRecord(data);
  if (!record) {
    return;
  }

  const id = readVisaId(record);
  if (id !== undefined) {
    ids.add(id);
  }
  Object.values(record).forEach((value) => collectVisaIds(value, ids));
}

function withLabels(data: unknown, labels: Map<number, VisaLabel>): unknown {
  if (Array.isArray(data)) {
    return data.map((item) => withLabels(item, labels));
  }

  const record = asRecord(data);
  if (!record) {
    return data;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    result[key] = withLabels(value, labels);
  }

  const id = readVisaId(record);
  const label = id === undefined ? undefined : labels.get(id);
  if (label) {
    result.visa_name = label.visa_name;
    result.destination_name = label.destination_name;
  }

  return result;
}

export function createVisaLabeler(fetchVisa: FetchVisa | null): AddVisaLabels {
  return async <T>(data: T, language?: string): Promise<T> => {
    if (!fetchVisa) {
      return data;
    }

    const ids = new Set<number>();
    collectVisaIds(data, ids);
    if (ids.size === 0) {
      return data;
    }

    const labels = new Map<number, VisaLabel>();
    // A failed lookup only drops the label; the record itself is still returned.
    await Promise.allSettled(
      [...ids].map(async (id) => {
        labels.set(id, extractVisaLabel(await fetchVisa(id, language)));
      })
    );

    return withLabels(data, labels) as T;
  };
}
