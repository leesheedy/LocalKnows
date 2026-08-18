/**
 * A deliberately small Markdown renderer.
 *
 * Editorial bodies in this repo use a fixed subset: h2, h3, paragraphs, bullet
 * and numbered lists, bold, inline links, blockquotes and pipe tables. Pulling
 * in a full CommonMark parser to render that subset would add a dependency, a
 * sanitiser requirement and about 60kb to the build for no gain.
 *
 * Input is trusted editorial content from this repository, not user submissions.
 * Everything is still HTML escaped before any markup is reintroduced.
 */

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Optional guard for internal links inside editorial bodies.
 *
 * A guide can reference /nsw/wagga-wagga/plumbers/ before Wagga has plumbers.
 * Rather than shipping the dead link, or pinning the guide to today's coverage,
 * the renderer is handed a predicate and drops the anchor when the target does
 * not exist yet. The words stay, the link does not, and the link comes back on
 * its own the build after the page does.
 */
export type LinkExists = (href: string) => boolean;

let linkGuard: LinkExists | null = null;

function inline(text: string): string {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, href: string) => {
    const external = /^https?:\/\//i.test(href);
    if (!external && linkGuard && !linkGuard(href)) return label;
    const rel = external ? ' rel="noopener" target="_blank"' : '';
    return '<a href="' + href + '"' + rel + '>' + label + '</a>';
  });
  return out;
}

const slugId = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export interface Heading {
  level: 2 | 3;
  text: string;
  id: string;
}

export interface RenderedMarkdown {
  html: string;
  headings: Heading[];
  wordCount: number;
}

export function renderMarkdown(src: string, linkExists?: LinkExists): RenderedMarkdown {
  linkGuard = linkExists ?? null;
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  const headings: Heading[] = [];
  let i = 0;

  const flushParagraph = (buf: string[]) => {
    if (!buf.length) return;
    out.push('<p>' + inline(buf.join(' ')) + '</p>');
    buf.length = 0;
  };

  const para: string[] = [];

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph(para);
      i++;
      continue;
    }

    // headings
    const h = /^(#{2,3})\s+(.*)$/.exec(trimmed);
    if (h) {
      flushParagraph(para);
      const level = (h[1].length === 2 ? 2 : 3) as 2 | 3;
      const text = h[2].trim();
      const id = slugId(text);
      headings.push({ level, text, id });
      out.push('<h' + level + ' id="' + id + '">' + inline(text) + '</h' + level + '>');
      i++;
      continue;
    }

    // pipe table
    if (trimmed.startsWith('|') && lines[i + 1] && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      flushParagraph(para);
      const header = splitRow(trimmed);
      i += 2;
      const body: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        body.push(splitRow(lines[i].trim()));
        i++;
      }
      out.push(
        '<div class="table-scroll"><table><thead><tr>' +
          header.map((c) => '<th scope="col">' + inline(c) + '</th>').join('') +
          '</tr></thead><tbody>' +
          body
            .map((r) => '<tr>' + r.map((c) => '<td>' + inline(c) + '</td>').join('') + '</tr>')
            .join('') +
          '</tbody></table></div>',
      );
      continue;
    }

    // blockquote
    if (trimmed.startsWith('>')) {
      flushParagraph(para);
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        buf.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      out.push('<blockquote><p>' + inline(buf.join(' ')) + '</p></blockquote>');
      continue;
    }

    // unordered list
    if (/^[-*]\s+/.test(trimmed)) {
      flushParagraph(para);
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ''));
        i++;
      }
      out.push('<ul>' + items.map((t) => '<li>' + inline(t) + '</li>').join('') + '</ul>');
      continue;
    }

    // ordered list
    if (/^\d+[.)]\s+/.test(trimmed)) {
      flushParagraph(para);
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ''));
        i++;
      }
      out.push('<ol>' + items.map((t) => '<li>' + inline(t) + '</li>').join('') + '</ol>');
      continue;
    }

    para.push(trimmed);
    i++;
  }
  flushParagraph(para);

  return {
    html: out.join('\n'),
    headings,
    wordCount: src.split(/\s+/).filter(Boolean).length,
  };
}

function splitRow(row: string): string[] {
  return row
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

/** Plain text version, used for meta descriptions and answer engine summaries. */
export function stripMarkdown(src: string, limit = 400): string {
  const text = src
    .replace(/\r\n/g, '\n')
    .replace(/^\|.*$/gm, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`>]/g, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > limit ? text.slice(0, limit).trimEnd() + '…' : text;
}
