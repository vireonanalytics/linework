import { readFileSync } from "node:fs";

/**
 * data/SOURCES.md is the paper trail, and it is the authority on provenance.
 *
 * Parsing it rather than duplicating it into a seed script means there is
 * exactly one place a source URL or a verification date can be wrong, and it
 * is the human-readable one that gets reviewed. The numbers come from
 * lib/datasets/<slug>.ts; the provenance comes from here; nothing is retyped
 * into SQL.
 */

export type SourceRecord = {
  slug: string;
  sourceName: string;
  sourceUrl: string;
  /** Free text as written in the table, e.g. "not yet retrieved". */
  retrieved: string;
  /** Parsed from the Verified column. Anything that is not a clear yes is no. */
  verified: boolean;
  /** ISO date when the Verified column carries one, else null. */
  verifiedOn: string | null;
  /** The prose under `## <slug>`, used as methodology_note. */
  methodologyNote: string | null;
};

const ISO_DATE = /\b(\d{4}-\d{2}-\d{2})\b/;

function splitRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

/** Strip markdown inline code, links and emphasis down to plain text. */
function plain(cell: string): string {
  return cell
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_]/g, "")
    .trim();
}

function urlFrom(cell: string): string {
  const link = cell.match(/\]\((https?:\/\/[^)]+)\)/);
  if (link) return link[1];
  const bare = cell.match(/https?:\/\/\S+/);
  return bare ? bare[0].replace(/[.,;]+$/, "") : "";
}

/**
 * Pull the prose under `## <slug>` so the methodology note in the database is
 * the same text a reader of SOURCES.md sees.
 */
function sectionFor(markdown: string, slug: string): string | null {
  const lines = markdown.split("\n");
  const start = lines.findIndex(
    (line) => plain(line).toLowerCase() === `## ${slug}`.toLowerCase(),
  );
  if (start === -1) return null;

  const body: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^##\s/.test(lines[i])) break;
    body.push(lines[i]);
  }

  const text = body.join("\n").replace(/^\s*-{3,}\s*$/gm, "").trim();
  return text.length > 0 ? text : null;
}

export function parseSources(markdown: string): Map<string, SourceRecord> {
  const records = new Map<string, SourceRecord>();

  for (const line of markdown.split("\n")) {
    if (!line.trimStart().startsWith("|")) continue;

    const cells = splitRow(line);
    if (cells.length < 5) continue;

    const slug = plain(cells[0]);
    // Skip the header row ("Slug" has a capital) and the |---|---| separator.
    // The leading-alphanumeric requirement is what rejects the separator: a
    // bare "---" is otherwise a valid-looking slug, since slugs allow hyphens.
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) continue;

    const verifiedCell = plain(cells[4]);
    const isoMatch = verifiedCell.match(ISO_DATE);
    const verified =
      isoMatch !== null || /^(yes|true)$/i.test(verifiedCell.trim());

    records.set(slug, {
      slug,
      sourceName: plain(cells[1]),
      sourceUrl: urlFrom(cells[2]),
      retrieved: plain(cells[3]),
      verified,
      verifiedOn: isoMatch ? isoMatch[1] : null,
      methodologyNote: sectionFor(markdown, slug),
    });
  }

  return records;
}

export function readSources(
  path = "data/SOURCES.md",
): Map<string, SourceRecord> {
  return parseSources(readFileSync(path, "utf8"));
}
