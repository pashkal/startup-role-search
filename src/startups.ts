import { appendRow, ensureSheet, readRange } from "./sheets.ts";
import { normalizeDomain } from "./normalize.ts";

export const SHEET = "Startups";

export const HEADERS = [
  "domain",
  "name",
  "website",
  "ats",
  "ats_slug",
  "status",
  "created_at",
] as const;

export interface Startup {
  domain: string;
  /** Left empty here; the pipeline derives it when it enriches the company. */
  name: string;
  website: string;
  /** "pending" until the (not yet built) detection pass fills it in. */
  ats: string;
  ats_slug: string;
  /** Freeform outreach status; stages TBD. */
  status: string;
  created_at: string;
}

export type AddResult =
  | { status: "created"; startup: Startup }
  | { status: "exists"; domain: string };

export function initStorage(): Promise<void> {
  return ensureSheet(SHEET, [...HEADERS]);
}

function toRow(s: Startup): string[] {
  return HEADERS.map((h) => s[h]);
}

/**
 * Normalizes the domain, skips if it's already in the sheet, otherwise appends a row.
 * Dedup is a read-then-append, which is fine for a single user adding companies by hand.
 */
export async function addStartup(rawDomain: string): Promise<AddResult> {
  const domain = normalizeDomain(rawDomain);

  const existing = await readRange(SHEET, "A2:A");
  if (existing.some((row) => row[0]?.trim().toLowerCase() === domain)) {
    return { status: "exists", domain };
  }

  const startup: Startup = {
    domain,
    name: "",
    website: `https://${domain}`,
    ats: "pending",
    ats_slug: "",
    status: "",
    created_at: new Date().toISOString(),
  };

  await appendRow(SHEET, toRow(startup));
  return { status: "created", startup };
}
