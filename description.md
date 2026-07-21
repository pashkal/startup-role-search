Building a tool to look for open roles in startups given a startup list and a fuzzy search term (e.g. "platform engineer" or "devops engineer").

Overall goal is to identify fitting vacancies and later cold reach out to the hiring managers / CEOs / CTOs asking for a research call. (Contact discovery itself is out of scope for v1 — handled manually.)

Rough PRD:
- there's a list of startups (up to ~200 to start)
- there's a list of "saved searches" that are fuzzy search terms
- for every search, there's an up-to-date list of open roles that fit it across the companies (pipeline is triggered manually for now)
- fit is judged semantically by an LLM against the search intent, so synonyms (SRE, infra, devops) are caught without hand-tuned keyword lists
- for every fitting opening, there's some notion of status tracking for what status the reach-out to this startup is at (status is a freeform field for now; exact stages TBD after real use)

Scope / stack:
- Web app with the standard frontend / backend / storage split, but Google Sheets are the storage layer
- Vacancies come only from the top three hosted ATSs — Greenhouse, Lever, Ashby — via their APIs / JSON feeds. No scraping for vacancies. Companies on other boards are flagged for manual handling. (Scraping a company's site for a description is fine.)

Two flows for starters:
1) Ingest the list of startup names and websites, normalize the data, identify which of the three supported job boards the startup is using (flag the rest)
2) Add a saved search, pull each company's openings from its ATS, have the LLM judge fit, save links to fitting openings

Working agreements:
- No feature branches. Commit straight to `main` and push directly — don't create branches or pull requests for changes here.

Design notes:
- Re-runs must be idempotent: match openings to existing rows so a refresh updates the list without losing status tracking on already-seen openings.
- Cache LLM fit verdicts keyed by (opening, search) so repeat runs stay cheap and only new/changed openings hit the model.
