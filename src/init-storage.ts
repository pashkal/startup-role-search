// Standalone check: verifies credentials + spreadsheet access and creates the
// tab if needed, then exits. Useful for setup and for CI-style smoke checks.
import { initStorage } from "./startups.ts";

try {
  await initStorage();
  console.log("Storage OK");
} catch (err) {
  const e = err as { response?: { data?: { error?: { message?: string } } } };
  console.error(e?.response?.data?.error?.message ?? (err as Error).message);
  process.exit(1);
}
