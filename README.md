# LocalKnows

An independent business and places directory for New South Wales and Victoria.

Starts in Albury Wodonga, expands region by region. Covers trades and services,
food and drink, pubs and clubs, accommodation, things to do, and community groups.

## What makes it rank

1. Cross border logic. Service area is modelled separately from physical address,
   so a Lavington plumber who works in Wodonga appears on VIC pages without lying
   about where it is. Every other directory treats the state line as a wall.
2. Verified licences, checked against NSW Fair Trading and the Victorian Building
   Authority registers.
3. Unique data on every page, generated from real listings. Average callout fee,
   how many trade Saturdays, how many hold a current licence, how many cross the
   border. That is what keeps thousands of pages out of thin content territory.
4. A portal layer, not just a directory. Free tools, events, a local news wire and
   guides earn the links that make the directory rank.

## Repo layout

```
public/index.html        Full UI prototype (homepage, member zone, partner program)
docs/ARCHITECTURE.md     URL structure, taxonomy, page templates, SEO spec
docs/schema.sql          Postgres / Supabase schema with PostGIS
netlify.toml             Build and redirect config
```

Open `public/index.html` in a browser. Three views, switchable from the nav:
the public directory, the MemberZone listing editor, and the link partner program.

## Status

Prototype and specification. No app code yet.

Next: scaffold Astro, stand up Supabase from `docs/schema.sql`, seed the Albury
Wodonga locality set, build the locality x category template.

## A note on the link partner program

The original plan was a dofollow link in exchange for a dofollow link back.
Google's spam policies name that arrangement explicitly, twice, so it is not built
that way. Dofollow is earned by verification tier instead, and the badge program
runs separately with rel="nofollow". Reasoning is in `docs/ARCHITECTURE.md` section 6.

---

Built by [Automatrix Digital](https://automatrix.au).
