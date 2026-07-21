import express from "express";
import { fileURLToPath } from "node:url";
import { config } from "./config.ts";
import { requireApiSecret } from "./auth.ts";
import { ValidationError } from "./normalize.ts";
import { addStartup, initStorage } from "./startups.ts";

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

app.post("/startups", async (req, res) => {
  try {
    const result = await addStartup(String(req.body?.domain ?? ""));
    res.status(result.status === "created" ? 201 : 200).json(result);
  } catch (err) {
    if (err instanceof ValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    console.error("Failed to add startup:", err);
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
