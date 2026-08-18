# LocalKnows

An independent business and places directory for New South Wales and Victoria.

Starts in Albury Wodonga, expands region by region. Covers trades and services,
food and drink, pubs and clubs, accommodation, things to do, and community groups.

Built with Astro, static output, no client framework. Every page is a file on disk.

---

## What makes it rank

1. **Cross border logic.** Service area is modelled separately from physical
   address, so a Lavington plumber who works in Wodonga appears on Victorian
   pages without lying about where it is. Every other directory treats the state
   line as a wall.
2. **Sources on every fact.** Each listing shows the URLs its details were read
   from and the date they were last read. A directory that will not say where its
   information came from is asking to be trusted for nothing.
3. **Unique data on every page.** Average call out fee, how many trade Saturdays,
   how many hold a licence we have checked, how many cross the border. Generated
   from that page's own listing rows, which is what keeps thousands of pages out
   of thin content territory.
4. **A portal layer, not just a directory.** Free tools, events, a local news wire
   and guides earn the links that make the directory rank.

---

## Repo layout

```
src/lib/            The whole architecture lives here
  types.ts          Data contracts. Everything else codes against these.
  repo.ts           THE repository. Templates read from here and nowhere else.
  site.ts           Site constants and POLICY, the indexation thresholds.
  indexability.ts   One decision function for robots meta, sitemap and link rel.
  seo.ts            Every JSON-LD node and every head string, in one place.
  copy.ts           Generated prose. The per page data block.
  geo.ts            Distance and the cross border neighbour bias.
  markdown.ts       A 200 line renderer for the editorial subset. No dependency.
  build.ts          BUILD_DATE, stamped once and used everywhere.

src/data/           JSON seed. Swap for Supabase by rewriting repo.ts only.
  geo-nsw.json      NSW regions and localities
  geo-vic.json      VIC regions and localities
  categories.json   Taxonomy and long tail modifiers
  businesses/       Researched source records, one file per cluster
  listings.json     Built from businesses/ by scripts/ingest-businesses.mjs

src/components/     MoneyPage, BusinessPage, ModifierPage, LocalityPage, RegionPage
src/layouts/        Base.astro. The only layout. All of <head> is assembled there.
src/pages/          Routes. Thin. They resolve params and hand off to a component.

scripts/
  ingest-businesses.mjs  Research records -> typed listings, with scoring
  preflight.mjs          Fails the build on a broken invariant
  postbuild.mjs          Sitemaps, robots.txt, llms.txt, _redirects, _headers
  verify-build.mjs       Crawls dist and asserts the SEO contract
  fetch-places.mjs       Real Google ratings, with a 30 day cache ceiling
  og.mjs                 Open Graph images from SVG
  fonts.mjs              One off, pulls the self hosted woff2 files

docs/ARCHITECTURE.md     URL structure, taxonomy, page templates, SEO spec
docs/schema.sql          Postgres / Supabase schema with PostGIS
docs/prototype.html      The original single file design prototype
```

---

## URL architecture

```
/                                        Home
/nsw/                                    State hub
/nsw/riverina/                           Region hub
/nsw/albury/                             Locality hub
/nsw/albury/cafes/                       MONEY PAGE  (locality x category)
/nsw/albury/cafes/page/2/                Pagination, indexable, self canonical
/nsw/albury/cafes/the-proprietor/        Business detail
/nsw/albury/pubs/beer-garden/            Long tail modifier
/nsw/albury/events/                      Locality events
/business/the-proprietor/                301 to the canonical business URL
/categories/  /categories/cafes/         Taxonomy hubs
/guides/  /lists/  /wire/  /tools/  /events/
```

Rules that are enforced by `scripts/preflight.mjs` rather than by convention:

- Trailing slash everywhere. A link without one fails `npm run verify`.
- A region slug can never equal a locality slug inside one state, because they
  share the `/state/<slug>/` namespace.
- A business slug can never equal a modifier slug inside one locality and
  category, because they share `/state/place/category/<slug>/`.
- Category slugs can never collide with a reserved route segment (`events`,
  `page`, `business`, `search`).
- A listing URL never contains the suburb twice and a listing has exactly one
  canonical page even when it services twenty localities.

---

## Indexation

One function, `decide()` in `src/lib/indexability.ts`, drives the robots meta
tag, sitemap membership and priority together. They cannot disagree.

| Page | Rule |
|---|---|
| Locality x category | `noindex, follow` below 5 listings, flips automatically above it |
| Modifier page | Not generated at all below 5 listings. Never a 200 with an empty state. |
| Listing | `noindex, follow` below a quality score of 40 |
| Locality with no listings | `noindex, follow` |
| Search, filters | Always `noindex, follow` |

Nothing is ever deleted or 404ed. A thin page goes `noindex, follow` and keeps
its links.

`scripts/postbuild.mjs` builds the sitemap by reading the rendered
`<meta name="robots">` off every built page, so a noindex page cannot appear in
a sitemap even if the model that generated it thought otherwise.

---

## What this site will not claim

These are enforced in code, not in a policy document.

- **No invented ratings.** A star rating only ever comes from
  `scripts/fetch-places.mjs` reading the Google Places API, and it carries the
  date it was fetched. Ratings older than 30 days are deleted automatically,
  which is both Google's caching rule and the honest thing to do. With no API
  key set, listing pages show a link to the Google profile instead.
- **No `aggregateRating` without visible reviews.** `src/lib/seo.ts` only emits
  it on a page that renders the review text, and `npm run verify` fails the build
  if that is ever violated.
- **No unverified licence dressed as verified.** A licence number read off a
  business's own website is shown as exactly that. `hasCredential` is only
  emitted for a licence checked against a state register, with the check date.
- **No fabricated service area.** Where a service area was derived from distance
  rather than stated by the business, the page says "estimated" and the
  `areaServed` property is omitted from the structured data.
- **No paid ranking.** Ordering comes from a completeness score. Promoted
  placement, when it exists, is boxed, labelled, and excluded from `ItemList`.

---

## Running it

```bash
npm install
node scripts/ingest-businesses.mjs   # businesses/*.json -> listings.json
npm run build                        # preflight, astro build, postbuild
npm run verify                       # crawl dist and assert the SEO contract
npm run dev
```

Optional, with a key:

```bash
GOOGLE_MAPS_API_KEY=... node scripts/fetch-places.mjs
node scripts/og.mjs
```

`npm run build` fails if the data is inconsistent. That is the point.

---

## What still needs a human, once

The site is live and self maintaining. Six things need a decision or a key from
you, and none of them block anything that is already working.

| | What | Where |
|---|---|---|
| 1 | **Turn on Netlify Forms.** It is currently off, so the contact, claim, correction and verified forms render and submit but nothing is captured. Netlify project settings, Forms, enable form detection, then redeploy. | Netlify UI |
| 2 | **Confirm the Verified price.** `PLANS.verified.price` is set to an indicative $29 a month. It is a business decision, not a code one. | `src/lib/site.ts` |
| 3 | **Flip `PLANS.live` when Stripe is connected.** Until then `/verified/` says on its face that it is not open, and collects interest instead of money. | `src/lib/site.ts` |
| 4 | **Add `GOOGLE_MAPS_API_KEY`** if you want real star ratings. Without it every listing links to its Google profile instead, which is the intended fallback and not a failure. | Netlify env, GitHub secret |
| 5 | **Add `INDEXNOW_KEY`** to ping Bing and friends on every refresh. Generate one with `node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"`. | GitHub secret |
| 6 | **`pip install crawl4ai && crawl4ai-setup`** on whichever machine runs the town expansion scraper. | Local |

Also worth doing once: verify the domain in Google Search Console and submit
`https://localsknow.com.au/sitemap.xml`.

### A naming thing

The site content, the repo and the wordmark all say **LocalKnows**. The domain is
**localsknow.com.au**. Both are used consistently as they stand and nothing is
broken by it, but they are two different words and it is worth deciding which one
is the brand before anybody prints anything.

---

## It runs itself

Three things happen without anybody touching them.

**Weekly refresh** (`.github/workflows/refresh.yml`). Regenerates the data driven
wire articles, expires any Google rating older than 30 days, refreshes them if a
key is configured, rebuilds, verifies, pings IndexNow, and commits. The commit is
what triggers the Netlify deploy, so nothing in CI talks to Netlify.

**Generated articles** (`scripts/generate-wire.mjs`). Writes three pieces a month
from `listings.json`: the directory report, what trades charge to turn up, and who
publishes weekend hours. No language model is involved, which is exactly why the
output can publish without review. Every sentence in them is a count. An automated
pipeline that writes opinions needs a human before it ships; one that writes
arithmetic does not.

**What is on** re-partitions on every build. `BUILD_DATE` decides which events are
upcoming and which have passed, so a scheduled rebuild is the whole mechanism. Past
events keep their page, go `noindex, follow`, and say plainly that they have passed.

Two things are deliberately NOT automated, and both are load bearing:

- **Publishing scraped businesses.** `scripts/scrape.mjs` writes to an inbox and a
  person promotes them. An unreviewed scraped row is how a directory fills up with
  businesses that closed in 2019, which is the reason nobody trusts the incumbents.
- **Curated lists.** They are meant to be opinionated and human. A generated
  "best of" is a ranking with the judgement taken out, and it earns no links.

```bash
npm run refresh     # regenerate, rebuild, verify. What CI runs.
npm run wire        # just the generated articles
npm run places      # just the Google ratings
npm run indexnow    # tell Bing and friends what changed
```

---

## Expanding to a new town

Coverage grows town by town. Wagga, Shepparton, Wangaratta, Corowa and Deniliquin
are the next corridor.

```bash
pip install crawl4ai && crawl4ai-setup      # once
node scripts/scrape.mjs --town=wagga-wagga --state=NSW --seeds=seeds.txt
node scripts/scrape.mjs --list              # what is waiting
# fill in categorySlug, description and an address or phone for each candidate
node scripts/scrape.mjs --promote=wagga-wagga
node scripts/ingest-businesses.mjs && npm run build && npm run verify
```

`crwl` is used instead of a plain fetch because most council and tourism listing
pages are JavaScript rendered and a raw GET returns an empty shell.

Seed URLs, in order of how much they are worth: the council business directory, the
regional tourism operator list, the chamber of commerce member list, then individual
business sites. Do not seed it with a competitor directory. Their terms prohibit it,
their data is stale, and copying an index is not a product.

A scraped candidate is not a listing. It has a name and a URL and nothing that has
been checked. The promote step exists so somebody looks at it first.

---

## The paid tier

`/verified/` sells the licence **checking work**, not the badge, and the distinction
is enforced rather than promised:

- A subscription that fails the register check does not get a badge.
- If a licence lapses mid subscription the badge comes off at the next monthly check
  and the billing keeps running. That is deliberately the wrong way round for us.
- Nothing about a plan is an input to `rank()` in `src/lib/repo.ts`. There is no
  field a payment writes to and no branch in the sort that reads one.

Prices live in `PLANS` in `src/lib/site.ts`. `PLANS.live` is `false` until billing is
connected, and while it is false the page says so on its face instead of taking money
for something that does not exist.

Every directory in the country sells a trust badge, which is why nobody believes one.
The moment a badge is bought rather than passed it stops carrying information, and a
reader who works that out discounts every badge on the site including the honest ones.

---

## Adding a locality, a category or a business

- **Locality**: add it to `src/data/geo-nsw.json` or `geo-vic.json`. It needs a
  real postcode, real coordinates and a blurb that is specific to that town. A
  duplicated blurb is flagged by preflight, because that is how thin content
  starts.
- **Category**: add it to `src/data/categories.json` with a schema.org type that
  actually exists. If you are not sure a type exists, use `LocalBusiness`.
- **Business**: add a record to a file in `src/data/businesses/` with its
  `sources` array filled in, then re-run the ingest. A record with no source is
  a warning today and should be an error once the pipeline is fed by claims.

---

## Moving to Supabase

`docs/schema.sql` is the target. Nothing in `src/pages/` or `src/components/`
reads a JSON file: they all go through `src/lib/repo.ts`. Reimplement the
functions in that one module against Supabase and the templates do not change.

---

## The link partner program

The original plan was a dofollow link in exchange for a dofollow link back.
Google's spam policies name that arrangement explicitly, twice, so it is not
built that way. Dofollow is earned by verification tier instead, and the badge
program runs separately with `rel="nofollow"`. Reasoning is in
`docs/ARCHITECTURE.md` section 6, and the rule itself is `outboundRel()` in
`src/lib/indexability.ts`.

---

Built by [Automatrix Digital](https://automatrix.au).
