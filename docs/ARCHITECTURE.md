# LocalKnows

An independent business and places directory for New South Wales and Victoria.

Starts in Albury Wodonga, expands outward by region. Covers trades and services,
food and drink, pubs and clubs, accommodation, things to do, and community groups.

---

## 1. Positioning

Three things make this rank when Yellow Pages, TrueLocal and Localsearch do not:

1. Cross border logic. Every other directory treats the NSW and VIC boundary as a
   hard wall. Businesses that service both sides are invisible on half the queries
   they should own. LocalKnows models service area separately from physical address.
2. Verified licences. Trade licence numbers checked against NSW Fair Trading and the
   VIC Building Authority registers. Nobody else does this and it is the thing that
   makes the site quotable by AI answer engines.
3. Real hours and real closures. Weekly automated checks, plus public holiday logic
   that differs between NSW and VIC. "Open now" that is actually correct.

---

## 2. URL architecture

Flat, predictable, keyword aligned. Location first, category second.

```
/                                     Home
/nsw/                                 State hub
/nsw/riverina/                        Region hub
/nsw/albury/                          Locality hub
/nsw/albury/plumbers/                 MONEY PAGE  (locality x category)
/nsw/albury/plumbers/page/2/          Pagination, indexable, self canonical
/nsw/albury/plumbers/emergency/       Long tail modifier page
/nsw/albury/pubs/beer-garden/         Attribute page
/nsw/albury/plumbers/riverside-plumbing-co/   Listing detail
/business/riverside-plumbing-co/      301 alias to the canonical listing URL
/nsw/albury/events/                   Locality events
/categories/                          Category index
/categories/plumbers/                 Category hub, national, links to localities
/guides/what-plumbers-charge-nsw/     Editorial
/lists/best-pubs-albury/              Curated list page
/partners/                            Link partner program
```

Rules:

- Trailing slash everywhere, enforced by Netlify redirect. Pick one and never change it.
- Listing detail sits under its locality and its primary category. The original
  plan put it at a location independent `/business/<slug>/` so a business that
  moved kept its URL. That was traded away deliberately: the location and
  category in the path is worth more in the SERP than the churn it costs, and
  a business that moves is rare compared to a business that gets found. The
  location independent form is kept as a permanent 301 alias, written into
  `_redirects` at build time, so a listing still has one stable identifier.
- A listing has exactly one canonical page even when it services twenty
  localities. Service area drives which locality pages it appears ON, never how
  many pages it has.
- Region and locality share the `/state/<slug>/` namespace, so a region slug can
  never equal a locality slug inside a state. `scripts/preflight.mjs` fails the
  build if one ever does, rather than leaving it to a naming convention.
- A business slug and a modifier slug share `/state/place/category/<slug>/`.
  Same rule, same check.
- Region is a real tier, not decoration. It is how you scale to 800 localities without
  a flat 800 item sitemap that Google ignores.
- Modifier pages only exist when there is search volume AND at least 5 qualifying
  listings. Otherwise they 404, not 200 with an empty state.

### Locality tiers

| Tier | Example | Page treatment |
|---|---|---|
| 1 | Sydney, Melbourne, Newcastle, Geelong, Albury | Full build, all categories, editorial intro, curated lists |
| 2 | Wagga, Ballarat, Bendigo, Wodonga, Shepparton | Full build, top 25 categories |
| 3 | Jindera, Yackandandah, Corowa | Category pages only where 5+ listings exist |
| 4 | Tiny localities | Roll up into nearest tier 2 or 3. No standalone pages. |

---

## 3. Taxonomy

Six verticals. Each has its own listing template, its own schema type, and its own
set of attributes. This matters because a pub and a plumber need completely
different filters and Google treats them as different entity types.

### Trades and services
LocalBusiness / Plumber / Electrician / HVACBusiness / RoofingContractor
Attributes: licence number, licence state, ABN, service areas, emergency callout,
after hours rate, insurance cover, warranty period, callout fee.

### Eat and drink
Restaurant / CafeOrCoffeeShop / Bakery / BarOrPub
Attributes: cuisine, price band, bookings, dietary (GF, vegan, halal), takeaway,
outdoor seating, licensed or BYO, kid friendly, dog friendly, parking.

### Pubs and clubs
BarOrPub / NightClub / SportsClub / Casino
Attributes: beer garden, live music nights, meals served until, TAB, pokies,
courtesy bus, function room capacity, accommodation on site, RSL or bowls or golf.

### Stay
Hotel / Motel / BedAndBreakfast / Campground / Resort
Attributes: star rating, pet friendly, family rooms, check in times, parking,
pool, EV charging, accessible rooms, cancellation policy.

### Things to do
TouristAttraction / Park / Museum / AmusementPark / Winery / SkiResort
Attributes: entry cost, booking required, duration, best season, wet weather option,
accessibility, pram friendly, dog allowed, toilets on site.

### Clubs and hobbies
SportsClub / Organization / EducationalOrganization
Attributes: meeting day and time, membership fee, junior program, come and try,
season dates, contact person, affiliated body.
This vertical is the sleeper. Almost nothing competes for "model railway club Wagga"
or "sailing club Lake Hume" and these pages earn real links from member sites.

---

## 4. Page templates and what makes each one rank

### Locality x category page (the money page)

Above the fold: H1 "Plumbers in Albury NSW", live count, map, filter rail.
Then: 10 to 20 listing cards with logo, rating, verified tick, distance, open state.
Then, and this is the part competitors skip, a data block generated from your own
listings:

- Average callout fee across listings in this locality
- How many are open Saturdays
- How many hold a current licence you have verified
- How many service the other side of the border
- Median response time from quote requests through the site

That block is unique text on every one of thousands of pages, generated from real
data, not spun. It is what keeps you out of thin content territory and it is
exactly the kind of thing an AI answer engine quotes with attribution.

Then: FAQ block with FAQPage schema, drawn from real questions asked through the site.
Then: internal links to nearby localities, related categories, and the region hub.

Indexation rule: noindex, follow if fewer than 5 listings. Flip to index automatically
once the count crosses the threshold. Never delete, never 404 a page that once ranked.

### Listing detail page

Full LocalBusiness schema, logo, gallery, hours with special hours, service area
polygon, licence with verification date, reviews with author and date, Q and A,
and an outbound link to their site.

The outbound link is dofollow when the listing is verified. See section 6.

### Curated list page

"Best pubs with a beer garden in Albury". Human written, opinionated, ranked, with a
last reviewed date. These are the pages that earn links naturally and the pages that
LLMs cite. Budget one per tier 1 locality per month.

---

## 5. Structured data

Every page carries the right type. Non negotiable.

- Listing: LocalBusiness subtype, with areaServed as a GeoShape or list of
  AdministrativeArea, hasCredential for the licence, aggregateRating only when the
  reviews are real and on page.
- Category page: ItemList of listings, plus BreadcrumbList, plus FAQPage.
- Curated list: ItemList with position, plus Article.
- Guides: Article with author and datePublished.
- Site wide: Organization and WebSite with SearchAction.

Do not put aggregateRating on a page where the reviews are not visible. That is a
manual action waiting to happen.

---

## 6. The link partner program

### The problem with the original idea

Google's spam policies name this exact arrangement twice. "Excessive link exchanges
(link to me and I'll link to you) or partner pages exclusively for the sake of
cross linking" is listed as link spam. So is "requiring a link as part of a terms of
service, contract, or similar arrangement without allowing a third party content
owner the choice of qualifying the outbound link."

An automated system that grants a dofollow link conditional on receiving one is the
textbook definition. It leaves a temporal footprint (links appearing in both
directions within minutes of each other, at scale, from one IP range) that
SpamBrain is built to detect. At 500 partners it is not a subtle pattern.

Both sides lose. Their link gets devalued and your outbound profile looks engineered.

### What to build instead

Decouple the reward from the reciprocity. Same product, same conversion rate, no risk.

Dofollow is earned by verification, not by linking back:

| Listing state | Outbound link |
|---|---|
| Unclaimed, scraped | nofollow |
| Claimed, unverified | nofollow |
| Claimed, ABN verified, profile 80%+ complete | dofollow |
| Verified, licence checked against state register | dofollow, plus verified badge |

That is editorial. You are vouching for businesses you actually checked. It is
defensible in a reconsideration request and it gives owners a reason to complete
their profile, which is what you actually want.

The badge program runs alongside and is a traffic and trust play, not a PageRank play:

- Owner grabs an embed snippet from their dashboard
- Badge renders their live rating and verification status, pulled from your API
- The badge link carries rel="nofollow" by default, with a clear note explaining why
- You crawl weekly to confirm the badge is live, and show it in their dashboard

The crawler is worth building regardless. Knowing who links to you, when it went
live, and when it disappears is useful data even with nothing conditional attached.

### Crawler spec

```
POST /api/partners/verify
  { listing_id }

  1. Fetch the listing's registered domain, homepage plus /links, /partners, /about
  2. Parse for an anchor to localsknow.com.au containing the listing slug
  3. Record: found, url, rel attributes, anchor text, http status, first_seen
  4. Re-check weekly, mark as lapsed after 2 consecutive misses
  5. Never gate any ranking benefit on the result
```

Rate limit to 1 request per domain per 5 seconds. Respect robots.txt. Identify as
LocalKnowsBot with a URL in the user agent explaining what it does.

### Where links actually come from

The badge program is not a link building strategy, it is a retention feature. Real
links come from:

- Curated list pages. Businesses that make the list link to it unprompted.
- Community club pages. Sporting and hobby clubs link out generously and their
  sites are old and trusted.
- Council and tourism board resource pages. Pitch the region hubs.
- Local news. The data blocks give journalists a statistic to cite.
- Original research. "What tradies charge across regional NSW, 2026" published
  annually off your own quote data.

---

## 7. Data model

See `schema.sql`. Key decisions:

- `service_areas` is a separate join table, not a column on the listing. A plumber
  in Lavington servicing Wodonga appears on VIC pages without lying about its address.
- `licences` is its own table with state, number, class, expiry and last_verified_at.
  One business can hold NSW and VIC licences.
- `listing_attributes` is EAV keyed by vertical so pubs and plumbers can have wildly
  different fields without 200 nullable columns.
- Every listing has a `quality_score` computed nightly. It drives ranking order,
  dofollow eligibility, and the listing strength meter in the dashboard.
- `redirects` table so merged or renamed listings never 404.

---

## 8. Build and hosting

- Astro with static output, hybrid rendering for search and filters
- Supabase Postgres for data, PostGIS for service area geometry
- Netlify for hosting, edge functions for the search endpoint
- Sitemaps split by vertical and state, index sitemap at the root, max 45k URLs each
- ISR or scheduled rebuild nightly. Do not rebuild 300k pages on every listing edit.

Performance budget: LCP under 2.0s on 4G, CLS under 0.05, no CLS from logo loading
(reserve the square, always). At this page count, crawl budget is a real constraint
and slow pages get crawled less.

---

## 9. Rollout

Phase 1, Albury Wodonga. All six verticals, 1,200 listings, 38 localities.
Prove the template, prove the data blocks, get the first 50 claims.

Phase 2, border corridor. Wagga, Shepparton, Wangaratta, Corowa, Deniliquin.
Same template, mostly automated. Watch for thin page signals.

Phase 3, regional NSW and VIC. Ballarat, Bendigo, Geelong, Newcastle, Wollongong,
Dubbo, Tamworth. This is where the region tier earns its keep.

Phase 4, Sydney and Melbourne. Only after the regional footprint is ranking.
Metro is a knife fight and you want domain authority before you enter it.

Do not seed empty pages ahead of listings. A locality goes live when it has content.

---

## 10. The portal layer

A directory alone has no reason to be linked to. The listings belong to the
businesses, so nobody cites you for them. Four content types fix that, and each one
feeds crawl equity back into the money pages.

### Free tools

```
/tools/licence-check/                 Live check against NSW Fair Trading + VBA
/tools/what-should-this-cost/         Median quoted price by job type and region
/tools/abn-lookup/                    ABN active + GST status
/tools/public-holidays/               NSW vs VIC calendar, penalty rate implications
/tools/quote-comparison/              One brief out to five verified trades
/tools/business-name-check/           ASIC name + domain + handle availability
```

These are the link magnets. A tool page earns links passively for years, which is
what makes the rest of the site rank. The licence checker in particular is a
defensible asset: no competitor has it, and it feeds your own verification pipeline
for free every time a member of the public runs a check.

Schema: SoftwareApplication or WebApplication, plus FAQPage.
Do not gate them. Do not require signup. The whole point is the link.

### Events

```
/events/                              All events, both states
/nsw/albury/events/                   Locality events
/events/markets/                      Type hub
/events/2026-08-22-business-expo/     Detail page
```

Event schema is one of the last rich result types with almost no competition in
regional Australia. Markets, club open days, trade nights, expos. Free to submit,
which is also a listing acquisition funnel: whoever submits the event usually
claims the venue listing.

Expire events to a 410 after 90 days, or keep the page with an "this event has
passed, here is the next one" block. Never leave stale dates indexed.

### The wire

```
/wire/                                Index
/wire/albury-shopfront-grant-2026/    Article
```

Original local business news. Weekly is enough. This is what makes the domain look
like a publisher rather than a scraper farm, and it is what gets you into Google
News and Discover eventually.

The single highest value piece is the annual rates report, published off your own
quote data. "What tradies charged across regional NSW in FY26" is a citable
statistic. Journalists link to statistics. LLMs quote statistics with attribution.

### Guides

```
/guides/what-plumbers-cost-nsw/
/guides/nsw-vic-licence-rules/
```

Every guide must carry a visible last reviewed date and a named author. Review
every six months and update the date honestly. Stale evergreen content is the
number one cause of a directory getting flattened by a core update.

### Member zone

Free tier: claim, edit, logo, hours, reply to reviews, see view counts.
Paid tier later: enquiry routing, featured placement clearly labelled as such,
API access to your own reviews, multi location management.

Never let paid placement affect organic ordering. Label it, box it, keep it out of
the ItemList schema. The moment ranking is for sale, the trust proposition that
makes the whole site work is gone.

---

## 11. Internal linking flywheel

The pattern that makes 300k pages actually get crawled:

```
Tool page          ->  earns external links
  |
  v
Guide / wire       ->  links down to 3-5 relevant locality x category pages
  |
  v
Locality hub       ->  links to all its categories, its region, its neighbours
  |
  v
Category page      ->  links to listings, modifiers, nearby localities, the guide
  |
  v
Listing            ->  links back up to its locality, its category, its region
```

Rules:

- Every page links up one tier and sideways to 4 to 8 peers. Never orphan.
- Neighbour links cross the border deliberately. Albury links to Wodonga.
- Category pages link to the guide that covers that category, and the guide links
  back to the top 5 localities. That is the loop that pushes authority down.
- Cap footer links. A 200 link footer dilutes everything.
- Breadcrumbs on every page, with BreadcrumbList schema.

---

## 12. Technical SEO checklist

- One canonical per page, self referencing. Filters and sorts are canonical to the
  unfiltered page and carry noindex, follow.
- Pagination: /page/2/ with self referencing canonical, indexable, never noindexed.
- Faceted navigation behind a robots.txt disallow for parameter combinations you do
  not want crawled. Pick the 3 or 4 facets worth indexing and make them real paths.
- hreflang not needed, but do set en-AU and geo-appropriate content.
- Sitemaps split by type and state, index sitemap at root, lastmod accurate.
  Inaccurate lastmod is worse than none.
- Log file analysis monthly once you pass 50k pages. Crawl budget becomes the
  binding constraint and you need to see where Googlebot is wasting time.
- Core Web Vitals: reserve the logo square to avoid CLS, lazy load below the fold,
  no layout shift from the map.
- IndexNow ping on publish for Bing, and submit fresh URLs via the Search Console API.
- Allow GPTBot, ClaudeBot, PerplexityBot and Google-Extended. Directories get cited
  constantly in AI answers and that is a growing referral channel.

---

## 13. What was built, and where it lives

The spec above is implemented. The mapping, so this document does not drift:

| Spec section | Implementation |
|---|---|
| 2. URL architecture | `src/lib/repo.ts` `url.*`, routes under `src/pages/` |
| 3. Taxonomy | `src/data/categories.json`, `src/lib/site.ts` `VERTICALS` |
| 4. Page templates | `src/components/MoneyPage.astro`, `BusinessPage.astro`, `ModifierPage.astro`, `LocalityPage.astro`, `RegionPage.astro` |
| 4. The data block | `src/lib/copy.ts` `statSentences()`, rendered by `DataBlock.astro`, computed by `localityCategoryStats()` |
| 5. Structured data | `src/lib/seo.ts`, one function per node type |
| 6. Link partner program | `outboundRel()` in `src/lib/indexability.ts`, page at `/partners/` |
| 7. Data model | `src/lib/types.ts` now, `docs/schema.sql` when it moves to Supabase |
| 8. Build and hosting | `astro.config.mjs`, `netlify.toml`, `scripts/postbuild.mjs` |
| 11. Internal linking | `LinkBlock.astro`, `neighboursOf()` with the cross border bias in `src/lib/geo.ts` |
| 12. Technical SEO | `src/lib/indexability.ts` for the policy, `scripts/verify-build.mjs` for the proof |

### Three decisions that changed during the build

1. **Listing URLs carry the location.** See section 2. The stable identifier is
   preserved as a redirect rather than as the canonical.

2. **Ratings are not invented, and neither is anything else.** Every listing
   records the URLs its details were read from and the date they were read. A
   star rating only exists if `scripts/fetch-places.mjs` pulled it from the
   Google Places API, and it is deleted automatically after 30 days, which is
   both Google's caching limit and the point at which the number stops being
   true. Without an API key the page links to the Google profile instead. The
   same rule applies to licences: a number read off a business's own website is
   shown as published, not as verified, and `hasCredential` is only emitted once
   it has been checked against a register with a date recorded.

3. **Inferred service areas are labelled as inferred.** Deriving a trade's
   service area from a radius is useful, and it is what makes the cross border
   pages work before anybody has claimed a listing. But it is a guess, so the
   page says "estimated", and `areaServed` is left out of the structured data
   until the owner states it. Section 1's cross border claim is worth nothing if
   it is built on a fabricated field.

---

## 14. Automation

The site maintains itself between expansions. What is automated, and what is
deliberately not, is the whole design.

| Job | When | What it does |
|---|---|---|
| `ci.yml` | Every push | preflight, build, verify. The verifier is the gate. |
| `refresh.yml` | Weekly, Monday 06:00 AEST | Expire ratings past 30 days, refresh them, regenerate the data driven articles, rebuild, verify, ping IndexNow, commit |
| `smoke.yml` | Daily | Check every URL in the deployed sitemap returns 200 |

The commit from `refresh.yml` is what triggers the Netlify deploy. Nothing in CI
talks to Netlify directly.

### Why the generated articles can publish unreviewed

`scripts/generate-wire.mjs` writes three pieces a month out of `listings.json`:
the directory report, what trades charge to turn up, and who publishes weekend
hours. No language model is involved and every sentence in them is a count over
the rows on the site.

That is the test. An automated pipeline that writes opinions needs a human before
it ships, because an opinion can be wrong in a way that is invisible to the
machine producing it. One that writes arithmetic does not, because if the
arithmetic is wrong the data is wrong and the whole site is wrong with it.

### Why scraped businesses do not publish unreviewed

`scripts/scrape.mjs` uses the crawl4ai CLI to find candidates for a new town and
writes them to `src/data/businesses/_inbox/`. A separate `--promote` command
moves them into the live data.

A scraped row has a name and a URL and nothing that has been checked. Publishing
them unreviewed is how every incumbent directory ended up full of businesses that
closed in 2019, which is the thing this site exists to be an alternative to. The
review step is about thirty seconds per business and it is the product.

### Events

"What is on" is not a job. `BUILD_DATE` decides which events are upcoming and
which have passed, so a scheduled rebuild is the entire mechanism. A passed event
keeps its page, goes `noindex, follow`, and says so on its face with a pointer to
what is next. Nothing is deleted, per section 12.

---

## 15. The paid tier

`/verified/` sells the licence checking work. It does not sell the badge, and the
difference is enforced rather than promised:

- A subscriber whose licence does not check out does not get a badge.
- A licence that lapses mid subscription loses the badge at the next monthly
  check while the billing keeps running. That is deliberately the wrong way round
  for us, and the right way round for the reader.
- Nothing about a plan is an input to `rank()`. There is no field a payment writes
  to and no branch in the sort that reads one.

Prices live in `PLANS` in `src/lib/site.ts`. `PLANS.live` gates the page between
"opening soon" and "available", so it cannot take money for something that is not
connected yet.

Every directory in the country sells a trust badge, which is why nobody believes
one. The moment a badge is bought rather than passed it stops carrying
information, and a reader who works that out discounts every badge on the site
including the honest ones. The subscription is only worth anything while the badge
is worth something.

### Still to build

- Stripe subscription and the webhook that sets `plan` on a listing.
- The monthly re-check job against both registers, writing `lastVerifiedAt`.
- The 60 day expiry warning email.
- The member dashboard. `docs/prototype.html` has the design for it.
