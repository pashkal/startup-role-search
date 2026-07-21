import { appendRows, ensureSheet, readRange } from "./sheets.ts";
import { normalizeDomain, safeNormalizeDomain } from "./normalize.ts";

export const SHEET = "Startups";

// Appended-to only: existing rows keep their column positions.
export const HEADERS = ["domain", "name", "website", "status", "created_at"] as const;

export interface Startup {
  domain: string;
  /** Left empty here; enrichment fills it in later. */
  name: string;
  website: string;
  /** Freeform outreach status; stages TBD. Hand-edited in the sheet. */
  status: string;
  created_at: string;
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
      status: "",
      created_at: new Date().toISOString(),
    };
    created.push(startup);
    return { status: "created", domain, startup };
  });

  await appendRows(SHEET, created.map(toRow));
  return results;
}

/** Every startup currently in the sheet. */
export async function listStartups(): Promise<Startup[]> {
  const rows = await readRange(SHEET, `A2:${String.fromCharCode(64 + HEADERS.length)}`);
  return rows
    .map(
      (cells) =>
        Object.fromEntries(
          HEADERS.map((header, i) => [header, cells[i] ?? ""]),
        ) as unknown as Startup,
    )
    .filter((startup) => startup.domain.trim() !== "");
}
