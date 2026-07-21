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
