export class ValidationError extends Error {}

const DOMAIN_LABEL = "[a-z0-9](?:[a-z0-9-]*[a-z0-9])?";
const DOMAIN_RE = new RegExp(`^${DOMAIN_LABEL}(?:\\.${DOMAIN_LABEL})+$`);

/**
 * Turns anything the user might paste into a bare, comparable domain.
 * "https://WWW.Acme.com/careers?x=1" -> "acme.com"
 */
export function normalizeDomain(raw: string): string {
  let value = (raw ?? "").trim().toLowerCase();
  if (!value) throw new ValidationError("Domain is required.");

  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, ""); // protocol
  value = value.replace(/^[^/@]*@/, ""); // user info
  value = value.split(/[/?#]/)[0] ?? ""; // path, query, fragment
  value = value.split(":")[0] ?? ""; // port
  value = value.replace(/^www\./, "").replace(/\.$/, "");

  if (!DOMAIN_RE.test(value)) {
    throw new ValidationError(`"${raw.trim()}" doesn't look like a domain.`);
  }
  return value;
}

/**
 * Splits whatever the form or an API client sends into candidate domains:
 * a single string (pasted list, separated by newlines, commas or spaces) or an
 * array of them. Entries are only split apart here — validity is decided later,
 * per entry, so one bad domain doesn't sink the whole batch.
 */
export function splitDomains(input: unknown): string[] {
  const parts = Array.isArray(input) ? input : [input];
  return parts
    .flatMap((part) => String(part ?? "").split(/[\s,;]+/))
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

/**
 * Same as normalizeDomain but returns null instead of throwing. For values read
 * back from the sheet, which may have been typed in by hand as full URLs.
 */
export function safeNormalizeDomain(raw: string): string | null {
  try {
    return normalizeDomain(raw);
  } catch {
    return null;
  }
}
