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
  // retrying later; a page that loaded but had no board link is a real answer.
  return firstFetched
    ? { ats: "unsupported", slug: "", careersUrl: firstFetched }
    : { ats: "error", slug: "", careersUrl: "" };
}
