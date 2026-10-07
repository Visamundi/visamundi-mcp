// Partner records carry internal workflow codes (e.g. "paid", "to_process").
// Partners must only see what the status means for them, so every status is
// replaced with a partner-facing label before the record leaves the server.

// Traveler processing state.
const TRAVELER_LABELS: Record<string, string> = {
  to_pay: "Awaiting payment",
  to_process: "Awaiting processing",
  paid: "Currently being processed by our team",
  processing: "Currently being processed by our team",
  awaiting_client_info: "Waiting for additional information from the traveler",
  document_issued: "Visa issued",
  invoice_sent: "Invoice sent",
  cancelled: "Cancelled",
  refunded: "Refunded",
  rejected: "Rejected",
};

// Travel group / referred application file state.
const FILE_LABELS: Record<string, string> = {
  draft: "Drafting, submit for review",
  waiting_info: "Waiting for your inputs/modifications",
  reviewing: "Currently being reviewed by our team",
  processing: "Currently being processed by our team",
  submitting: "Currently being processed by our team",
  submitted: "Currently being processed by our team",
  completed: "Completed",
  cancelled: "Cancelled",
  archived: "Archived",
  not_found: "Not found",
  no_processing_data: "No processing time estimate available yet",
};

const INVOICE_LABELS: Record<string, string> = {
  draft: "Being prepared",
  sent: "Sent, awaiting payment",
  paid: "Paid",
  overdue: "Payment overdue",
  cancelled: "Cancelled",
};

const FILE_KEYS = new Set(["status", "submission_status"]);

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

// Unknown codes still must not leak as-is: "some_new_code" -> "Some new code".
function humanize(code: string): string {
  const text = code.replace(/[_-]+/g, " ").trim().toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function label(labels: Record<string, string>, value: unknown): unknown {
  return typeof value === "string" ? labels[value] ?? humanize(value) : value;
}

function isInvoice(record: Record<string, unknown>, inInvoices: boolean): boolean {
  return inInvoices || "invoice_id" in record || "invoice_number" in record;
}

function relabel(data: unknown, inInvoices: boolean): unknown {
  if (Array.isArray(data)) {
    return data.map((item) => relabel(item, inInvoices));
  }

  const record = asRecord(data);
  if (!record) {
    return data;
  }

  const invoice = isInvoice(record, inInvoices);
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (key === "backoffice_status") {
      result[key] = label(TRAVELER_LABELS, value);
    } else if (FILE_KEYS.has(key)) {
      result[key] = label(invoice ? INVOICE_LABELS : FILE_LABELS, value);
    } else {
      result[key] = relabel(value, key === "invoices");
    }
  }

  return result;
}

export function toPartnerStatuses<T>(data: T): T {
  return relabel(data, false) as T;
}
