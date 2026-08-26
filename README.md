# LocalsKnow

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
| Locality x category | `noindex, follow` below 3 listings, flips automatically above it |
| Modifier page | Not generated at all below 5 listings. Never a 200 with an empty state. |
| Listing | `noindex, follow` below a quality score of 40 |
| Locality with no listings | `noindex, follow` |
| Town guide | `noindex, follow` below 5 businesses based in the town |
| Town calendar | `noindex, follow` below 3 upcoming events |
| Category hub | `noindex, follow` while nothing is listed in it |
| Search, filters | Always `noindex, follow` |

The last two are the same argument as the first. A town calendar holding one
event is a page about one event, and that event already has its own page. A
category hub with nothing in it says "Nothing listed in this category yet" on its
own face, which is the page telling you it should not be in an index. The
taxonomy is meant to run ahead of the data, so a category will always be defined
before it is filled, and both kinds of page flip to indexed on their own the
build after somebody fills them.

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
| 1 | **Point form notifications at an inbox.** Form detection is on and the four forms register on deploy, but the notification recipient is a Netlify UI setting that cannot be set from the repo. Netlify project, Forms, Form notifications, add an email notification to `info@automatrix.au`. Each form already sends a distinct subject line and posts to `/thanks/`. | Netlify UI |
| 2 | **Confirm the Verified price.** `PLANS.verified.price` is set to an indicative $29 a month. It is a business decision, not a code one. | `src/lib/site.ts` |
| 3 | **Flip `PLANS.live` when Stripe is connected.** Until then `/verified/` says on its face that it is not open, and collects interest instead of money. | `src/lib/site.ts` |
| 4 | **Add `GOOGLE_MAPS_API_KEY`** if you want real star ratings. Without it every listing links to its Google profile instead, which is the intended fallback and not a failure. | Netlify env, GitHub secret |
| 5 | ~~**Add `INDEXNOW_KEY`**~~ **Done, 26 August 2026.** The key is `21221edf9f463bfa6c3b2ad8a0eee2d8`, `public/21221edf9f463bfa6c3b2ad8a0eee2d8.txt` is committed and serving, the repository secret is set, and the last manual ping submitted 1,693 URLs. The weekly refresh pings from here on. The key is not a secret in the security sense: IndexNow requires it to be publicly readable at the site root, which is the point of the file, so rotating it means generating a new one and committing the new file. | Done |
| 6 | **`pip install crawl4ai && crawl4ai-setup`** on whichever machine runs the town expansion scraper. | Local |
| 7 | **Extend `src/data/community.json`.** Eleven verified entries cover most towns via their council and regional paper. To add more, open the organisation's own site and copy the URL out of its footer. Never construct one from a name: `facebook.com/<TownName>` may belong to somebody else. `npm test` checks every entry resolves to real localities and records its source. | Local |

**Google Search Console is verified and the sitemap is submitted, 26 August 2026.**
The index and all nine child sitemaps were submitted. Google does not participate
in IndexNow, so until this was done the ping reached Bing, Yandex and the rest and
reached Google not at all.

Nothing more needs doing there, but two things are worth knowing when reading the
coverage report over the next month.

**Discovery is not indexing.** 1,693 URLs will be found within days and indexed
over weeks. A directory is exactly the kind of site Google indexes selectively, so
expect a large "Crawled, currently not indexed" bucket and do not read it as a
fault. The pages that sit there longest will be the thinnest, and the honest
answer to a thin page here has always been another listing on it rather than
another attempt to get it indexed.

**Watch the money pages, not the total.** The number that matters is how many
`/state/town/category/` pages are indexed, because those are the ones answering
"plumbers in Wagga Wagga". Every one of them was gated at three listings for this
reason. If a batch of them lands in "Discovered, currently not indexed", the fix
is coverage in that town, and `POLICY.minListingsToIndex` in `src/lib/site.ts` is
the dial that decides which ones are offered at all.

### A naming thing

The site content, the repo and the wordmark all say **LocalsKnow**. The domain is
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
- **Generated "best of" rankings.** A ranked list with the judgement taken out
  earns no links and deserves none. This rule was once written more broadly, as
  "no generated lists at all", and it has been narrowed deliberately rather than
  quietly: compiled lists now exist, but not one of them ranks anything. They
  order by street number, by founding year, by closing time or by town, they
  print the rule that selected them, and they are labelled compiled and kept in
  a separate file from the lists a person wrote. The thing the original rule was
  protecting, which is that a reader can tell human judgement from arithmetic,
  is protected by the label rather than by the absence. See "Curated lists"
  below.

```bash
npm run refresh     # regenerate, rebuild, verify. What CI runs.
npm run wire        # just the generated articles
npm run places      # just the Google ratings
npm run indexnow    # tell Bing and friends what changed
```

---

## Checking it

Three commands, three different jobs, and the build runs the first two.

```bash
npm test      # 182 hand worked assertions. Arithmetic, dates, data invariants.
npm run verify   # crawls dist: dead links, duplicate canonicals, sitemap agreement
npm run audit    # on page SEO report: descriptions, titles, thin pages, schema
npm run smoke    # checks every URL in the DEPLOYED sitemap returns 200
```

`npm test` and `verify` are gates: they fail the build. `audit` and `smoke` are
reports, because a weak meta description should be on a list, not blocking a
deploy.

The assertions are deliberately the kind somebody could check with a calculator
and a tape measure. 6m x 4m of concrete at 100mm is 2.4 cubic metres. A 30%
markup is a 23.08% margin. Easter Sunday 2027 is 28 March. 24m of fence at 2.4m
centres is exactly 10 bays and 11 posts, so exact division must not add a
phantom bay. Every one of those is published on the site as advice, which is the
only reason they are worth testing.

Nine of them are data invariants no build step covered: no verified licence
without a check date, no Google rating without a fetch date, every listing has a
source, every listing services its own locality, and no business is listed twice.

### The bug class this codebase actually has

Five times now, a page has been linked from somewhere that computed a threshold
differently to the route that builds it. Suburbs linked to town hubs that were
never generated; theme pages linked from eight places and built from none.

The fix each time is the same and it is worth stating as a rule: **a predicate
that decides whether a page exists lives in `src/lib/repo.ts`, and everything
that links to that page asks it.** `isLiveLocality`, `hasGuidePages`,
`hasLocalityEvents`, `themesFor`, `pageExists`. Never re-derive one at a call
site. `npm run verify` catches it when you do, which is what it is for.

There is a second class, and it is the same shape one level down: **a rule that
produced a value must be the thing that produces it again after a merge.** The
ingest used to union two records' service areas, which is right when the areas
were stated and wrong when they were inferred, because merging a Wagga Wagga
record with a Gumly Gumly one produced coverage the inference rule would never
have generated. It now re-derives an inferred area from the surviving locality
using the same function that produced it the first time. `npm test` is what
caught it, and the assertion that caught it is still there.

The third is not a bug in this code so much as a hole in it that was open for a
year: **a schema.org type that does not exist looks exactly like one that does.**
There is no `MortgageBroker`, no `Physiotherapist` and no `DrivingSchool`, and
all three read as though there should be. A wrong type lands on every listing in
the category, which is hundreds of pages, and nothing renders differently, so
nothing tells you. `scripts/preflight.mjs` now holds a list of the types that are
real and fails the build on anything else. If a type genuinely exists and is
missing from the list, add it to the list; that is the cheap half of the trade.

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

## Business imagery

A listing may carry a `logo` and up to a few `photos`. Both are optional and
most records have neither, because most were built from public sources and a
business's photographs are not ours to publish until they send them.

Files live under `public/img/biz/<slug>/` and the listing stores only the path
and, for photos, alt text. **Dimensions are never stored.** They are read out of
the file itself at build time by `src/lib/imagesize.mjs`, so a re-crop cannot
leave a stale width behind and the `<img>` always reserves the right box. Every
consumer — cards, the business page, the JSON-LD `image` property and the social
card — goes through `listingMedia()` in `src/lib/media.ts`, for the same reason
every other predicate lives in one place here.

Adding a business's images is three steps:

1. Download the files from the Netlify form submission.
2. Save them under `public/img/biz/<slug>/`.
3. Add `logo` and/or `photos` to the listing in `src/data/listings.json`. Photos
   need alt text describing the scene.

`npm run build` then fails if the path is wrong, the file is too small to be
anything but a thumbnail, the same file is used by two businesses, or a photo's
alt text is missing or is a placeholder like "Photo of the shop".

Uploads come in through the claim and verified forms. Netlify caps the whole
form request at 8 MB and times uploads out after 30 seconds, which a single
modern phone photo can breach on a rural connection, so
`src/components/UploadFields.astro` downscales images in the browser before they
are sent — 1600px on the long edge for a photo, 800px for a logo. It writes the
smaller file back into the input rather than posting over fetch, so the form
keeps its ordinary native submission.

## Curated lists

Two kinds, in two files, and the difference is printed on every page.

`src/data/lists.json` holds lists a person wrote: they chose the entries and
wrote the notes, and they carry a byline. **Nothing generates into this file.**

`src/data/lists-generated.json` is written by `npm run lists` and is safe to
delete and rebuild. Each compiled list prints the rule it was compiled by, the
same way the hidden gems page does, and every note under an entry is assembled
from the highlights already recorded against that listing during research.
Nothing is invented; the only editorial act is choosing which of a business's
facts are relevant to a given list, which is why the same cafe reads differently
on a Sunday list and on a step free list.

A compiled list only exists where it is a shape no other page has. Locality x
category is a money page, category x attribute is a modifier page, and the five
cross category cuts are theme pages. What is left is a street, a day out in
order, a category across a region, a cross vertical attribute cut, the businesses
that publish a founding year, what is open late, and free things to do across a
region. A compiled list also stands down when a hand written list already covers
the same ground, which is why there is no compiled Dean Street list.

`npm run build` fails if a list references a listing that does not exist or has
been suspended, lists the same business twice, has fewer than five entries, or
if a generated list is not marked `compiled` — because the index page tells
readers which lists a person wrote, and that has to stay true.
