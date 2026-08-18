/**
 * /wire/rss.xml
 *
 * Hand rolled rather than pulled from @astrojs/rss. The feed is forty lines of
 * string building and the dependency would only hide where the escaping happens,
 * which is the one part of a feed that actually breaks.
 */
import { url, wire } from '~/lib/repo';
import { abs } from '~/lib/seo';
import { SITE } from '~/lib/site';
import { BUILD_DATE } from '~/lib/build';

export const prerender = true;

const escapeXml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

/** A CDATA section cannot contain its own terminator, so it is split, not stripped. */
const cdata = (s: string): string => '<![CDATA[' + s.replace(/\]\]>/g, ']]]]><![CDATA[>') + ']]>';

/** RFC 822 date. toUTCString() emits exactly the form readers expect. */
const rfc822 = (iso: string): string =>
  new Date(iso.length === 10 ? iso + 'T00:00:00Z' : iso).toUTCString();

export const GET = async () => {
  const articles = wire.slice().sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

  const channelLink = abs(url.wire());
  const feedUrl = abs(url.wire() + 'rss.xml');
  const lastBuildDate = rfc822(articles[0]?.publishedAt ?? BUILD_DATE);
  const channelDescription =
    'Original local business writing from the desk. Grants, rates, licences and who is opening or closing across the New South Wales and Victorian border.';

  const items = articles
    .map((w) => {
      const link = abs(url.wireArticle(w));
      return [
        '    <item>',
        '      <title>' + escapeXml(w.title) + '</title>',
        '      <link>' + escapeXml(link) + '</link>',
        '      <guid isPermaLink="true">' + escapeXml(link) + '</guid>',
        '      <pubDate>' + rfc822(w.publishedAt) + '</pubDate>',
        '      <dc:creator>' + escapeXml(w.author) + '</dc:creator>',
        '      <description>' + cdata(w.description) + '</description>',
        '    </item>',
      ].join('\n');
    })
    .join('\n');

  const xml = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    '  <channel>',
    '    <title>' + escapeXml(SITE.name + ': the wire') + '</title>',
    '    <link>' + escapeXml(channelLink) + '</link>',
    '    <description>' + escapeXml(channelDescription) + '</description>',
    '    <language>en-au</language>',
    '    <copyright>' + escapeXml('© ' + new Date().getUTCFullYear() + ' ' + SITE.legalName) + '</copyright>',
    '    <lastBuildDate>' + lastBuildDate + '</lastBuildDate>',
    '    <ttl>1440</ttl>',
    '    <atom:link href="' + escapeXml(feedUrl) + '" rel="self" type="application/rss+xml" />',
    items,
    '  </channel>',
    '</rss>',
  ]
    .filter((line) => line !== '')
    .join('\n') + '\n';

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
