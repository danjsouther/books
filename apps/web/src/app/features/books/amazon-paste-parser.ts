import type { BookFormModel } from './book-form-page';

/**
 * Fields parsed out of an Amazon paste, keyed only by what was actually
 * found. An absent key must never be spread over an existing model value with
 * `''`/`null`/`0` — callers merge with `{ ...model, ...fields }` and rely on
 * "not present" meaning "leave it alone."
 *
 * `seriesId` is deliberately excluded: resolving a parsed series name (from
 * "Book 1 of 2: <name>") to a `seriesId` UUID would need a full series list
 * this page doesn't load — only `seriesOptions()`, populated from the live
 * search query — and a wrong silent match risks corrupting data worse than
 * leaving the field for the member to pick manually. `seriesPosition`, a
 * plain text field with no such lookup, is not subject to that limit.
 */
export type AmazonPasteFields = Partial<
  Pick<
    BookFormModel,
    | 'title'
    | 'subtitle'
    | 'authors'
    | 'description'
    | 'pageCount'
    | 'seriesPosition'
    | 'releaseDate'
    | 'releasePrecision'
    | 'asin'
    | 'coverUrl'
  >
>;

export interface AmazonParseResult {
  readonly fields: AmazonPasteFields;
  readonly matchedFieldCount: number;
}

/** Past this, extra content buys nothing and only risks a pathological regex
 *  scan over a giant clipboard blob — mirrors `tokenizedMatch`'s `MAX_TOKENS`
 *  cap in `packages/db/src/lib/text-search.ts`. */
const MAX_PASTE_LENGTH = 200_000;
const MAX_DESCRIPTION_LENGTH = 4000;
const MAX_AUTHORS = 10;

const BYLINE_PATTERN = /by\s+([^(]+)\(Author/i;
// Each author on the byline gets its own `(Author)` tag — "Name1 (Author),
// Name2 (Author)" — rather than one trailing `(Authors)` covering the whole
// list, so the segment up to "Format:" (or end of line) is pulled out first,
// then every individually-tagged name inside it is matched out in a second
// pass. `[^,()]` keeps a name from swallowing a neighboring "(Author)" tag or
// crossing a comma into the next name.
const BYLINE_SEGMENT_PATTERN = /by\s+(.+?)(?:\s*Format:|$)/im;
const AUTHOR_NAME_PATTERN = /([^,()]+?)\s*\(Authors?\)/gi;
const STARS_PATTERN = /out of 5 stars/i;
const GOODREADS_PATTERN = /on Goodreads/i;
const RATINGS_COUNT_PATTERN = /^\d[\d,]*\s*ratings?$/i;
const SEE_ALL_VARIANTS_PATTERN = /See all languages|See all formats/i;
const SERIES_TEXT_PATTERN = /Book\s+\d+\s+of\s+\d+/i;
const SERIES_LINE_PATTERN = /^Book\s+\d+\s+of\s+\d+/i;
const SERIES_POSITION_PATTERN = /Book\s+(\d+)\s+of\s+\d+/i;
const FORMAT_PATTERN = /Format:\s*(Kindle|Paperback|Hardcover|Audiobook)/i;
const PAGE_COUNT_PATTERN = /(\d[\d,]*)\s*pages\b/i;
const ASIN_PATTERN = /\b[A-Z0-9]{10}\b/;
const ASIN_LABEL_PATTERN = /ASIN/i;
const AMAZON_IMAGE_PATTERN = /media-amazon\.com|images-amazon\.com/i;
const PUBLICATION_DATE_TEXT_PATTERN = /Publication date/i;
const PUBLICATION_DATE_LABEL_PATTERN = /^Publication date$/i;
const PUBLICATION_DATE_VALUE_PATTERN = /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/;

const MONTH_NUMBERS: Record<string, string> = {
  january: '01',
  february: '02',
  march: '03',
  april: '04',
  may: '05',
  june: '06',
  july: '07',
  august: '08',
  september: '09',
  october: '10',
  november: '11',
  december: '12',
};

/** Lines that are page furniture (byline, star rating, series position, ...)
 *  rather than the book's own title or description text — used both to find
 *  where the description block starts and to keep the title parser from
 *  grabbing one of these when a paste starts mid-listing. */
function isNoiseLine(line: string): boolean {
  return (
    BYLINE_PATTERN.test(line) ||
    STARS_PATTERN.test(line) ||
    GOODREADS_PATTERN.test(line) ||
    RATINGS_COUNT_PATTERN.test(line) ||
    SERIES_LINE_PATTERN.test(line) ||
    SEE_ALL_VARIANTS_PATTERN.test(line)
  );
}

/** Lines that mark the end of the description block once it's started —
 *  Amazon appends "Read more" directly after it; the product-details labels
 *  are a fallback boundary for a paste that was trimmed before "Read more". */
const DESCRIPTION_END_PATTERNS = [
  /^Read more$/i,
  /^Print length$/i,
  /^Language$/i,
  /^Next slide/i,
  /^See all details/i,
  PUBLICATION_DATE_LABEL_PATTERN,
  // The product-details block repeats "Book 1 of 2" bare, with no title/colon
  // this time — a second, later occurrence of the same shape `isNoiseLine`
  // uses to find where the description *starts*. Needed as a fallback
  // boundary on a paste trimmed before "Read more" reaches this block.
  SERIES_LINE_PATTERN,
];

function truncate(value: string): string {
  return value.length > MAX_PASTE_LENGTH ? value.slice(0, MAX_PASTE_LENGTH) : value;
}

function splitLines(text: string): string[] {
  return text.split(/\r\n|\r|\n/).map((line) => line.trim());
}

/**
 * Whether `html`/`text` looks like a bulk Amazon product-page paste rather
 * than an ordinary paste into a single field (a title, a URL, an ASIN) — the
 * gate that decides whether `(paste)` on `BookFormPage`'s `<form>` intercepts
 * the event at all. Requires two independent signals, not one, so a single
 * coincidental match (e.g. some unrelated 10-character token) can't hijack a
 * normal paste. Thresholds and signals are tuned against a real Amazon book
 * listing paste (see the fixture in `amazon-paste-parser.spec.ts`) rather than
 * Amazon's markup, which isn't inspectable from here — a plain "select all and
 * copy" carries no HTML/ASIN/cover image at all, only distinctive phrasing.
 */
export function looksLikeAmazonProductPaste(html: string, text: string): boolean {
  const t = truncate(text);
  const h = truncate(html);
  if (t.trim().length < 150) return false;

  let signals = 0;
  if (BYLINE_PATTERN.test(t)) signals++;
  if (STARS_PATTERN.test(t)) signals++;
  if (SERIES_TEXT_PATTERN.test(t)) signals++;
  if (FORMAT_PATTERN.test(t)) signals++;
  if (PAGE_COUNT_PATTERN.test(t)) signals++;
  if (PUBLICATION_DATE_TEXT_PATTERN.test(t)) signals++;
  if (ASIN_PATTERN.test(t) && ASIN_LABEL_PATTERN.test(t)) signals++;
  if (AMAZON_IMAGE_PATTERN.test(h)) signals++;

  return signals >= 2;
}

/**
 * Amazon's own listing title is frequently `Title: Subtitle` — the fixture's
 * "Hell Difficulty Tutorial: A LitRPG Adventure" is one — and `BookFormModel`
 * already has a dedicated `subtitle` field, so the first colon on the title
 * line is treated as that separator rather than left embedded in `title`.
 * Only the first colon counts; a subtitle that itself contains one (rare) stays
 * intact rather than being split further.
 */
function parseTitleAndSubtitle(lines: string[]): { title?: string; subtitle?: string } {
  const first = lines.find((line) => line.length > 0);
  if (first === undefined || isNoiseLine(first)) return {};

  const separatorIndex = first.indexOf(':');
  if (separatorIndex === -1) return { title: first };

  const title = first.slice(0, separatorIndex).trim();
  const subtitle = first.slice(separatorIndex + 1).trim();
  if (title.length === 0 || subtitle.length === 0) return { title: first };
  return { title, subtitle };
}

function parseAuthors(text: string): string[] | undefined {
  const segment = BYLINE_SEGMENT_PATTERN.exec(text)?.[1];
  if (segment === undefined) return undefined;
  const names = [...segment.matchAll(AUTHOR_NAME_PATTERN)]
    .map((match) => match[1]?.trim())
    .filter((name): name is string => name !== undefined && name.length > 0);
  return names.length > 0 ? names.slice(0, MAX_AUTHORS) : undefined;
}

/** `seriesId` is out of scope (see the module doc comment above), but this
 *  plain text field needs no series lookup — just the position number out of
 *  "Book 1 of 2". */
function parseSeriesPosition(text: string): string | undefined {
  return SERIES_POSITION_PATTERN.exec(text)?.[1];
}

function parsePageCount(text: string): number | undefined {
  const captured = PAGE_COUNT_PATTERN.exec(text)?.[1];
  if (captured === undefined) return undefined;
  const value = Number(captured.replace(/,/g, ''));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * The description has no label of its own to search for — the reliable
 * anchor is what surrounds it: it starts right after the leading, contiguous
 * run of page furniture (byline/stars/ratings/series/"See all..."), and
 * Amazon appends "Read more" directly after it. A paste trimmed before "Read
 * more" falls back to the product-details labels that come right after it
 * instead.
 *
 * Finding the *end* of that leading run — rather than the *last* noise-shaped
 * line anywhere in the first N lines — matters because "Book 1 of 2" reappears
 * bare, deeper in the product-details block. A short description (or one
 * missing "Read more") can put that repeat within a fixed-size lookahead
 * window, and a "last match wins" search would skip the entire real
 * description and re-anchor on that repeat instead.
 */
function parseDescription(lines: string[]): string | undefined {
  const start = findDescriptionStart(lines);
  if (start === undefined) return undefined;

  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (line !== undefined && DESCRIPTION_END_PATTERNS.some((pattern) => pattern.test(line))) {
      end = i;
      break;
    }
  }

  const body = lines
    .slice(start, end)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (body.length === 0) return undefined;
  return body.length > MAX_DESCRIPTION_LENGTH ? body.slice(0, MAX_DESCRIPTION_LENGTH) : body;
}

/** The title (line 0) is furniture too, just not something `isNoiseLine`
 *  recognizes, so it's always skipped before this scan starts. Returns
 *  `undefined` — no reliable anchor — when the very next line is already
 *  real content, since that means either the paste is too short to have a
 *  metadata block or it doesn't look like an Amazon listing at all. */
function findDescriptionStart(lines: string[]): number | undefined {
  let i = 1;
  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined) break;
    if (line.length === 0 || isNoiseLine(line)) {
      i++;
      continue;
    }
    break;
  }
  return i > 1 && i < lines.length ? i : undefined;
}

/**
 * The product-details block gives a "Publication date" label followed by its
 * value on the next non-blank line, e.g. "Publication date" / "May 14, 2024"
 * — same label/value shape as "Print length" / "618 pages". A full month/day/
 * year always resolves to `releasePrecision: 'day'`; if the label is found
 * but the following line isn't in that exact shape (a different locale's date
 * format, a missing value, ...) this leaves the field unmatched rather than
 * guessing a date that might be wrong.
 */
function parseReleaseDate(lines: string[]): string | undefined {
  const labelIndex = lines.findIndex((line) => PUBLICATION_DATE_LABEL_PATTERN.test(line));
  if (labelIndex === -1) return undefined;

  for (let i = labelIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined || line.length === 0) continue;
    const match = PUBLICATION_DATE_VALUE_PATTERN.exec(line);
    if (!match) return undefined;
    const monthName = match[1];
    const day = match[2];
    const year = match[3];
    if (monthName === undefined || day === undefined || year === undefined) return undefined;
    const month = MONTH_NUMBERS[monthName.toLowerCase()];
    if (month === undefined) return undefined;
    return `${year}-${month}-${day.padStart(2, '0')}`;
  }
  return undefined;
}

/**
 * ASIN and cover URL are rarely present at all in a plain "select all and
 * copy" of a listing (see the module doc comment) — they only show up when
 * the clipboard also carries `text/html` with the actual product markup, e.g.
 * a `data-asin` attribute or the cover `<img>`. Coming back unmatched here is
 * the expected, correct outcome for most real pastes, not a parsing failure.
 */
function parseAsin(doc: Document | null, text: string): string | undefined {
  const attr = doc?.querySelector('[data-asin]')?.getAttribute('data-asin') ?? undefined;
  if (attr && ASIN_PATTERN.test(attr)) return attr;
  if (!ASIN_LABEL_PATTERN.test(text)) return undefined;
  const match = ASIN_PATTERN.exec(text);
  return match ? match[0] : undefined;
}

function parseCoverUrl(doc: Document | null): string | undefined {
  const img = doc?.querySelector<HTMLImageElement>('img#landingImage, img#imgBlkFront');
  if (!img) return undefined;
  return img.getAttribute('data-old-hires') ?? img.getAttribute('src') ?? undefined;
}

function setField<K extends keyof AmazonPasteFields>(
  fields: AmazonPasteFields,
  key: K,
  compute: () => AmazonPasteFields[K] | undefined,
): void {
  try {
    const value = compute();
    if (value !== undefined) fields[key] = value;
  } catch {
    // One brittle, markup-dependent extractor must not take the others down
    // with it — this is heuristic parsing over a page we don't control.
  }
}

export function parseAmazonPaste(html: string, text: string): AmazonParseResult {
  const t = truncate(text);
  const h = truncate(html);
  const lines = splitLines(t);

  let doc: Document | null = null;
  if (h.trim().length > 0 && typeof DOMParser !== 'undefined') {
    try {
      doc = new DOMParser().parseFromString(h, 'text/html');
    } catch {
      doc = null;
    }
  }

  const fields: AmazonPasteFields = {};
  setField(fields, 'title', () => parseTitleAndSubtitle(lines).title);
  setField(fields, 'subtitle', () => parseTitleAndSubtitle(lines).subtitle);
  setField(fields, 'authors', () => parseAuthors(t));
  setField(fields, 'description', () => parseDescription(lines));
  setField(fields, 'pageCount', () => parsePageCount(t));
  setField(fields, 'seriesPosition', () => parseSeriesPosition(t));
  // The DB requires `releaseDate`/`releasePrecision` to agree — a date with no
  // precision (or vice versa) is a 500 waiting to happen at submit — so these
  // are only ever set together, never one without the other.
  setField(fields, 'releaseDate', () => parseReleaseDate(lines));
  setField(fields, 'releasePrecision', () => (parseReleaseDate(lines) ? 'day' : undefined));
  setField(fields, 'asin', () => parseAsin(doc, t));
  setField(fields, 'coverUrl', () => parseCoverUrl(doc));

  return { fields, matchedFieldCount: Object.keys(fields).length };
}
