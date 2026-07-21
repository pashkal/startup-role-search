// Loads .env into process.env (Node built-in, no dotenv dependency).
try {
  process.loadEnvFile();
} catch {
  // No .env file present — fall back to whatever is already in the environment.
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export interface ServiceAccount {
  client_email: string;
  private_key: string;
}

function parseServiceAccount(): ServiceAccount {
  const raw = required("GOOGLE_SERVICE_ACCOUNT");
  let parsed: Partial<ServiceAccount>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT is not valid JSON. It must be the service account key on a single line.",
    );
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT is missing client_email or private_key.");
  }
  return parsed as ServiceAccount;
}

export const config = {
  spreadsheetId: required("GOOGLE_SPREADSHEET_ID"),
  serviceAccount: parseServiceAccount(),
  // Required, not optional: a missing secret must stop the server rather than
  // silently leave the API open.
  apiSecret: required("API_SECRET"),
  port: Number(process.env.PORT ?? 3000),
};
