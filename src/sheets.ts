import { JWT } from "google-auth-library";
import { config } from "./config.ts";

const API = "https://sheets.googleapis.com/v4/spreadsheets";

const auth = new JWT({
  email: config.serviceAccount.client_email,
  key: config.serviceAccount.private_key,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await auth.request<T>({
    url: `${API}/${config.spreadsheetId}${path}`,
    method: (init.method ?? "GET") as "GET" | "POST" | "PUT",
    data: init.body,
  });
  return res.data;
}

/** Creates the tab with its header row if it isn't there yet. Safe to call repeatedly. */
export async function ensureSheet(title: string, headers: string[]): Promise<void> {
  const meta = await call<{ sheets?: { properties?: { title?: string } }[] }>(
    "?fields=sheets.properties.title",
  );
  const exists = meta.sheets?.some((s) => s.properties?.title === title);

  if (!exists) {
    await call(":batchUpdate", {
      method: "POST",
      body: { requests: [{ addSheet: { properties: { title } } }] },
    });
  }

  const firstRow = await readRange(title, "1:1");
  if (firstRow.length === 0) {
    await call(
      `/values/${encodeURIComponent(`${title}!A1`)}?valueInputOption=RAW`,
      { method: "PUT", body: { values: [headers] } },
    );
  }
}

/** `range` is A1 notation without the sheet name, e.g. "A2:A". */
export async function readRange(title: string, range: string): Promise<string[][]> {
  const data = await call<{ values?: string[][] }>(
    `/values/${encodeURIComponent(`${title}!${range}`)}`,
  );
  return data.values ?? [];
}

export async function appendRow(title: string, row: string[]): Promise<void> {
  await call(
    `/values/${encodeURIComponent(`${title}!A1`)}:append` +
      "?valueInputOption=RAW&insertDataOption=INSERT_ROWS",
    { method: "POST", body: { values: [row] } },
  );
}
