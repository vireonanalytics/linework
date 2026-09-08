import assert from "node:assert/strict";
import { test } from "node:test";
import { allDatasets, curatedDatasets } from "./index.ts";
import { parseSources, readSources } from "./sources.ts";

test("the real SOURCES.md covers every HAND-AUTHORED dataset", () => {
  // If this fails, a hand-authored dataset has been added without a paper
  // trail.
  //
  // Scoped to curatedDatasets, not allDatasets: imported series carry their
  // provenance in sourceSeriesId - a re-fetchable indicator code - and
  // deliberately have no SOURCES.md row. Writing 331 rows into a document
  // nobody hand-reviewed would produce something that LOOKS like a paper
  // trail while being generated, which is worse than not having one.
  const sources = readSources();
  for (const dataset of curatedDatasets) {
    assert.ok(
      sources.has(dataset.slug),
      `${dataset.slug} has no row in data/SOURCES.md`,
    );
  }
});

test("SOURCES.md agrees with the dataset modules about verification", () => {
  // The seed script refuses to run when these disagree; catching it here means
  // finding out at `npm test` instead of at deploy time.
  const sources = readSources();
  for (const dataset of curatedDatasets) {
    const source = sources.get(dataset.slug)!;
    assert.equal(
      source.verified,
      dataset.verified,
      `${dataset.slug}: SOURCES.md says verified=${source.verified}, ` +
        `module says ${dataset.verified}`,
    );
  }
});

const SAMPLE = `
# Sources

| Slug | Source organization | Direct download URL | Retrieved | Verified | Known discontinuities |
|---|---|---|---|---|---|
| \`us-teen-birth-rate\` | CDC / NCHS | https://wonder.cdc.gov/natality.html | not yet retrieved | **NO** | See notes |
| \`eu-rail-usage\` | Eurostat | [download](https://ec.europa.eu/eurostat/data) | 2026-01-04 | 2026-02-11 | none |

---

## us-teen-birth-rate

**Status: UNVERIFIED.**

Rates get rebased after each decennial census.

## eu-rail-usage

Passenger-kilometres, all operators.
`;

test("parses a bare URL and a markdown link the same way", () => {
  const parsed = parseSources(SAMPLE);
  assert.equal(
    parsed.get("us-teen-birth-rate")!.sourceUrl,
    "https://wonder.cdc.gov/natality.html",
  );
  assert.equal(
    parsed.get("eu-rail-usage")!.sourceUrl,
    "https://ec.europa.eu/eurostat/data",
  );
});

test("a date in the Verified column means verified, on that date", () => {
  const parsed = parseSources(SAMPLE);
  const rail = parsed.get("eu-rail-usage")!;
  assert.equal(rail.verified, true);
  assert.equal(rail.verifiedOn, "2026-02-11");
});

test("anything that is not a clear yes counts as unverified", () => {
  const parsed = parseSources(SAMPLE);
  const teen = parsed.get("us-teen-birth-rate")!;
  assert.equal(teen.verified, false);
  assert.equal(teen.verifiedOn, null);
});

test("the header and separator rows are not read as datasets", () => {
  const parsed = parseSources(SAMPLE);
  assert.equal(parsed.size, 2);
  assert.ok(!parsed.has("slug"));
});

test("the prose under a slug heading becomes the methodology note", () => {
  const parsed = parseSources(SAMPLE);
  const note = parsed.get("us-teen-birth-rate")!.methodologyNote!;
  assert.match(note, /decennial census/);
  // It must stop at the next heading rather than swallowing the whole file.
  assert.ok(!note.includes("Passenger-kilometres"));
});

test("markdown emphasis is stripped from cell values", () => {
  const parsed = parseSources(SAMPLE);
  assert.equal(parsed.get("us-teen-birth-rate")!.sourceName, "CDC / NCHS");
});

test("every imported dataset carries machine provenance instead of a SOURCES.md row", () => {
  const sources = readSources();
  const imported = allDatasets.filter((d) => d.sourceSeriesId);

  assert.ok(imported.length > 0, "expected some imported datasets");

  for (const dataset of imported) {
    assert.ok(
      !sources.has(dataset.slug),
      `${dataset.slug} is imported but ALSO has a SOURCES.md row - the two ` +
        "provenance mechanisms should not overlap, or it becomes unclear " +
        "which one is authoritative",
    );
    assert.match(
      dataset.sourceSeriesId!,
      /^[a-z]+:[A-Za-z0-9._-]+:[A-Z]{3}$/,
      `${dataset.slug} has a malformed sourceSeriesId`,
    );
  }
});

test("no dataset is rated green without a way to check it", () => {
  // Green asserts reproducibility. A green dataset with no series id is
  // making a claim nobody else can test, which is the one thing the rating
  // is supposed to prevent.
  for (const dataset of allDatasets) {
    if (dataset.reliability === "green") {
      assert.ok(
        dataset.sourceSeriesId,
        `${dataset.slug} is green but has no sourceSeriesId`,
      );
    } else {
      assert.ok(
        dataset.reliabilityNote,
        `${dataset.slug} is ${dataset.reliability} but has no note explaining why`,
      );
    }
  }
});

test("nothing was imported at red", () => {
  // The standing instruction: never upload red. Red exists only to describe
  // the hand-authored charts that predate the rating system.
  const importedRed = allDatasets.filter(
    (d) => d.sourceSeriesId && d.reliability === "red",
  );
  assert.deepEqual(importedRed.map((d) => d.slug), []);
});
