import express from "express";
import { fileURLToPath } from "node:url";
import { config } from "./config.ts";
import { requireApiSecret } from "./auth.ts";
import { splitDomains } from "./normalize.ts";
import { addStartups, initStorage } from "./startups.ts";

/** Google's errors arrive as huge objects; surface only the actionable part. */
function explainSheetsError(err: unknown): string {
  const e = err as { status?: number; response?: { data?: { error?: { message?: string } } } };
  const message = e?.response?.data?.error?.message ?? (err as Error)?.message ?? String(err);

  if (/SERVICE_DISABLED|has not been used in project/.test(message)) {
    return `the Google Sheets API is not enabled for this project.\n  Enable it, wait ~1 min, then retry:\n  https://console.cloud.google.com/apis/library/sheets.googleapis.com?project=${config.serviceAccount.client_email.split("@")[1]?.split(".")[0] ?? ""}`;
  }
  if (e?.status === 404) {
    return `no spreadsheet with id ${config.spreadsheetId}. Check GOOGLE_SPREADSHEET_ID.`;
  }
  if (e?.status === 403) {
    return `access denied. Share the spreadsheet with ${config.serviceAccount.client_email} as an Editor.`;
  }
  return message;
}

const app = express();
app.use(express.json());

// The form shell is served unauthenticated — it holds no data and cannot do
// anything until the secret is supplied. Everything past this point is gated.
app.use(express.static(fileURLToPath(new URL("../public", import.meta.url))));
app.use(requireApiSecret);

// Accepts one domain or many: `domain`/`domains`, as a string (newline-, comma-
// or space-separated) or an array. Always answers with a per-domain result list.
app.post("/startups", async (req, res) => {
  const domains = splitDomains(req.body?.domains ?? req.body?.domain);
  if (domains.length === 0) {
    res.status(400).json({ error: "At least one domain is required." });
    return;
  }

  try {
    const results = await addStartups(domains);
    const summary = {
      created: results.filter((r) => r.status === "created").length,
      exists: results.filter((r) => r.status === "exists").length,
      invalid: results.filter((r) => r.status === "invalid").length,
    };
    res.status(summary.created > 0 ? 201 : 200).json({ results, summary });
  } catch (err) {
    console.error("Failed to add startups:", err);
    res.status(500).json({ error: "Could not write to the spreadsheet." });
  }
});

// Verify the credentials and create the tab before accepting traffic, so a
// misconfigured .env fails loudly at boot instead of on the first submit.
try {
  await initStorage();
} catch (err) {
  console.error(`\nCould not reach the spreadsheet: ${explainSheetsError(err)}\n`);
  process.exit(1);
}

app.listen(config.port, () => {
  console.log(`Listening on http://localhost:${config.port}`);
});
