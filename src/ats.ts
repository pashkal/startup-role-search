export type AtsName = "greenhouse" | "lever" | "ashby";

/** Terminal values written to the `ats` column. */
export type AtsStatus = AtsName | "unsupported" | "error";

export interface DetectResult {
  ats: AtsStatus;
  slug: string;
  /** The page the board link was found on, or the last page fetched. */
  careersUrl: string;
}

export interface BoardLink {
  ats: AtsName;
  slug: string;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

const TIMEOUT_MS = 12_000;

/** Tried in order; `/careers` resolved 5/5 companies in testing, the homepage only 1/5. */
const CANDIDATE_PATHS = ["/careers", "/jobs", ""];

const verifyUrl: Record<AtsName, (slug: string) => string> = {
  greenhouse: (s) => `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(s)}/jobs`,
  lever: (s) => `https://api.lever.co/v0/postings/${encodeURIComponent(s)}?mode=json`,
  ashby: (s) => `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(s)}`,
};

/**
 * The embed pattern must be listed before the plain Greenhouse one, otherwise
 * "embed" itself gets captured as the slug.
 */
const LINK_PATTERNS: { ats: AtsName; re: RegExp }[] = [
  { ats: "greenhouse", re: /boards\.greenhouse\.io\/embed\/job_board\?(?:[^"'\s]*&)?for=([a-zA-Z0-9_-]+)/gi },
  { ats: "greenhouse", re: /(?:job-boards|boards)\.greenhouse\.io\/(?!embed\/)([a-zA-Z0-9_-]+)/gi },
  { ats: "lever", re: /jobs\.lever\.co\/([a-zA-Z0-9_-]+)/gi },
  { ats: "ashby", re: /jobs\.ashbyhq\.com\/([a-zA-Z0-9_-]+)/gi },
];

/** Path segments that are never a company slug. */
const NOT_SLUGS = new Set(["embed", "job_board", "jobs", "api", "search"]);

/**
 * Pure: pulls board links out of raw HTML. Slugs are returned verbatim because
 * casing matters to the board owner (e.g. jobs.ashbyhq.com/Linear).
 */
export function extractBoardLinks(html: string): BoardLink[] {
  const decoded = html.replace(/&amp;/gi, "&");
  const seen = new Set<string>();
  const links: BoardLink[] = [];

  for (const { ats, re } of LINK_PATTERNS) {
    for (const match of decoded.matchAll(re)) {
      const slug = match[1];
      if (!slug || NOT_SLUGS.has(slug.toLowerCase())) continue;
      const key = `${ats}:${slug}`;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({ ats, slug });
    }
  }
  return links;
}

/** Returns the body plus the post-redirect URL, which is the one worth recording. */
async function getPage(url: string): Promise<{ html: string; url: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.ok ? { html: await res.text(), url: res.url || url } : null;
  } catch {
    return null;
  }
}

const boardPageUrl: Record<AtsName, (slug: string) => string> = {
  greenhouse: (s) => `https://job-boards.greenhouse.io/${s}`,
  lever: (s) => `https://jobs.lever.co/${s}`,
  ashby: (s) => `https://jobs.ashbyhq.com/${s}`,
};

const simplify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Guards against slug collisions: a board only counts as this company's if it
 * names the company (Greenhouse returns company_name) or its public page
 * references the company's own domain.
 */
async function identityConfirmed(link: BoardLink, domain: string): Promise<boolean> {
  if (link.ats === "greenhouse") {
    try {
      const res = await fetch(verifyUrl.greenhouse(link.slug), {
        headers: { "User-Agent": UA },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) {
        const body = (await res.json()) as { jobs?: { company_name?: string }[] };
        const name = simplify(body.jobs?.[0]?.company_name ?? "");
        const label = simplify(domain.split(".")[0] ?? "");
        // "Gusto, Inc." vs "gusto" — either may contain the other.
        if (name && label && (name.includes(label) || label.includes(name))) return true;
      }
    } catch {
      // fall through to the page check
    }
  }

  const page = await getPage(boardPageUrl[link.ats](link.slug));
  return page !== null && page.html.toLowerCase().includes(domain.toLowerCase());
}

/**
 * Last resort when the site exposes no board link: try the domain's first label
 * as a slug. Accepted only if exactly one board matches — a slug that resolves
 * on two boards (vercel) proves the guess carries no information — and only
 * after the board is confirmed to belong to this company.
 */
async function probeBySlug(domain: string): Promise<BoardLink | null> {
  const slug = domain.split(".")[0];
  if (!slug) return null;

  const results = await Promise.all(
    (Object.keys(verifyUrl) as AtsName[]).map(async (ats) =>
      (await verify({ ats, slug })) ? ({ ats, slug } satisfies BoardLink) : null,
    ),
  );
  const matches = results.filter((m): m is BoardLink => m !== null);
  if (matches.length !== 1) return null;

  const [only] = matches;
  return only && (await identityConfirmed(only, domain)) ? only : null;
}

/** A board is only accepted once its own API confirms the slug resolves. */
async function verify(link: BoardLink): Promise<boolean> {
  try {
    const res = await fetch(verifyUrl[link.ats](link.slug), {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Resolves a company to its ATS using only evidence from its own site — slugs
 * are never guessed from the domain, because a guess can match two boards at
 * once (vercel.com resolves on both Greenhouse and Ashby).
 */
export async function detectAts(domain: string): Promise<DetectResult> {
  // Keep the FIRST page that loaded: paths are ordered most-careers-like first,
  // so this leaves a useful link for manual follow-up instead of the homepage.
  let firstFetched = "";

  for (const path of CANDIDATE_PATHS) {
    const page = await getPage(`https://${domain}${path}`);
    if (page === null) continue;
    firstFetched ||= page.url;

    for (const link of extractBoardLinks(page.html)) {
      if (await verify(link)) {
        return { ats: link.ats, slug: link.slug, careersUrl: page.url };
      }
    }
  }

  // Nothing fetched at all means the site was unreachable, which is worth
  // retrying later rather than probing on no evidence.
  if (!firstFetched) return { ats: "error", slug: "", careersUrl: "" };

  // The site loaded but named no board — common when listings are rendered
  // client-side, so fall back to probing the domain as a slug.
  const probed = await probeBySlug(domain);
  if (probed) {
    return { ats: probed.ats, slug: probed.slug, careersUrl: firstFetched };
  }

  return { ats: "unsupported", slug: "", careersUrl: firstFetched };
}
