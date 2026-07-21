import { appendRows, batchUpdateValues, ensureSheet, readRange } from "./sheets.ts";
import { normalizeDomain, safeNormalizeDomain } from "./normalize.ts";

export const SHEET = "Startups";

// Appended-to only: existing rows keep their column positions.
export const HEADERS = [
  "domain",
  "name",
  "website",
  "ats",
  "ats_slug",
  "status",
  "created_at",
  "careers_url",
] as const;

export interface Startup {
  domain: string;
  /** Left empty here; the pipeline derives it when it enriches the company. */
  name: string;
  website: string;
  /** "pending" until the (not yet built) detection pass fills it in. */
  ats: string;
  ats_slug: string;
  /** Freeform outreach status; stages TBD. Hand-edited in the sheet. */
  status: string;
  created_at: string;
  /** Page the ATS detection pass found the board link on. */
  careers_url: string;
}

/** A startup together with its 1-based row number in the sheet. */
export interface StartupRow {
  row: number;
  startup: Startup;
}

/** Per-domain outcome of an add request. Invalid entries are reported, not thrown. */
export type AddResult =
  | { status: "created"; domain: string; startup: Startup }
  | { status: "exists"; domain: string }
  | { status: "invalid"; input: string; error: string };

export function initStorage(): Promise<void> {
  return ensureSheet(SHEET, [...HEADERS]);
}

function toRow(s: Startup): string[] {
  return HEADERS.map((h) => s[h]);
}

/**
 * Normalizes each domain, skips the ones already in the sheet or repeated within
 * the batch, and appends the rest in a single write. Dedup is a read-then-append,
 * which is fine for a single user adding companies by hand.
 */
export async function addStartups(rawDomains: string[]): Promise<AddResult[]> {
  // Normalize what's already in the sheet too: rows added by hand are often
  // full URLs, which would otherwise slip past dedup and create a duplicate.
  const existing = await readRange(SHEET, "A2:A");
  const seen = new Set(
    existing
      .map((row) => safeNormalizeDomain(row[0] ?? ""))
      .filter((domain): domain is string => domain !== null),
  );

  const created: Startup[] = [];
  const results = rawDomains.map((raw): AddResult => {
    let domain: string;
    try {
      domain = normalizeDomain(raw);
    } catch (err) {
      return { status: "invalid", input: raw, error: (err as Error).message };
    }

    if (seen.has(domain)) return { status: "exists", domain };
    seen.add(domain); // also collapses duplicates inside this one request

    const startup: Startup = {
      domain,
      name: "",
      website: `https://${domain}`,
      ats: "pending",
      ats_slug: "",
      status: "",
      created_at: new Date().toISOString(),
      careers_url: "",
    };
    created.push(startup);
    return { status: "created", domain, startup };
  });

  await appendRows(SHEET, created.map(toRow));
  return results;
}

/** Every startup with its sheet row number, needed to target write-backs. */
export async function listStartups(): Promise<StartupRow[]> {
  const rows = await readRange(SHEET, "A2:H");
  return rows
    .map((cells, index) => {
      const startup = Object.fromEntries(
        HEADERS.map((header, i) => [header, cells[i] ?? ""]),
      ) as unknown as Startup;
      return { row: index + 2, startup }; // +2: 1-based, and row 1 is headers
    })
    .filter(({ startup }) => startup.domain.trim() !== "");
}

/**
 * Writes only the three cells this pass owns, leaving hand-edited columns
 * (notably `status`) untouched.
 */
export async function recordAtsResult(
  row: number,
  result: { ats: string; slug: string; careersUrl: string },
): Promise<void> {
  await batchUpdateValues([
    { range: `${SHEET}!D${row}:E${row}`, values: [[result.ats, result.slug]] },
    { range: `${SHEET}!H${row}`, values: [[result.careersUrl]] },
  ]);
}
