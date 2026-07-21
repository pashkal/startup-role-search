// Manual pipeline pass: resolves each startup to its ATS and writes the result
// back to the sheet. Run with `npm run detect-ats` (add `--all` to re-check
// rows that already resolved).
import { detectAts } from "./ats.ts";
import { safeNormalizeDomain } from "./normalize.ts";
import { initStorage, listStartups, recordAtsResult, type StartupRow } from "./startups.ts";

const CONCURRENCY = 5;
const RETRY_STATES = new Set(["", "pending", "error"]);

const all = process.argv.includes("--all");

/** Runs `worker` over `items`, keeping at most `limit` in flight. */
async function pooled<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      if (item !== undefined) await worker(item);
    }
  });
  await Promise.all(runners);
}

await initStorage();

const startups = await listStartups();
const todo = all
  ? startups
  : startups.filter(({ startup }) => RETRY_STATES.has(startup.ats.trim().toLowerCase()));

if (todo.length === 0) {
  console.log(`Nothing to do (${startups.length} startups, all resolved). Use --all to re-check.`);
  process.exit(0);
}

console.log(`Detecting ATS for ${todo.length} of ${startups.length} startups…\n`);

const tally = new Map<string, number>();

await pooled(todo, CONCURRENCY, async ({ row, startup }: StartupRow) => {
  // Rows typed straight into the sheet are often full URLs rather than domains.
  const domain = safeNormalizeDomain(startup.domain);
  if (domain === null) {
    tally.set("invalid", (tally.get("invalid") ?? 0) + 1);
    console.log(`  ${startup.domain.padEnd(28)} invalid domain — skipped`);
    return;
  }

  const result = await detectAts(domain);
  await recordAtsResult(row, result);
  tally.set(result.ats, (tally.get(result.ats) ?? 0) + 1);
  const detail = result.slug ? ` (${result.slug})` : "";
  console.log(`  ${domain.padEnd(28)} ${result.ats}${detail}`);
});

const summary = [...tally.entries()].map(([k, v]) => `${k}: ${v}`).join(", ");
console.log(`\nDone — ${summary}`);
