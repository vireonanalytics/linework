import test from "node:test";
import assert from "node:assert/strict";
import { generatedDatasets } from "./index.ts";

/**
 * Guards on the imported bundle's PROMPT TEXT, not its numbers.
 *
 * Why this file exists. The 2026-08-27 catalogue rewrite added a small set of
 * charts where a named country is the point, and the first draft framed each
 * one with an editorial hook: "one of the countries that improved fastest",
 * "a rich country whose population passed its peak", "a country Americans
 * routinely assume still has large families".
 *
 * Each of those hands the player the answer before they draw. That is a
 * uniquely nasty bug for this project, because it has NO VISIBLE SYMPTOM -
 * the chart renders, the guess records, the aggregate computes. It just
 * quietly stops measuring belief and starts measuring reading comprehension,
 * and nothing downstream can tell the difference afterwards.
 *
 * A comment in the catalogue is not enough protection for a failure that
 * silent, so the rule is asserted here. The word list is deliberately short
 * and aimed at direction-revealing language specifically; a false positive
 * costs one reword, while a false negative corrupts a dataset permanently.
 */

/**
 * Words that assert a DIRECTION or an EXTREME. A question may say what is
 * measured and may name a neutral era; it may not say which way the line
 * went, or that the value is a record.
 */
const LEADING_TERMS = [
  "fastest",
  "slowest",
  "biggest",
  "largest",
  "smallest",
  "lowest",
  "highest",
  "ever recorded",
  "passed its peak",
  "peaked",
  "record",
  "assume",
  "surprising",
  "shut its",
  "bet hardest",
  /*
   * "improved" earns its place despite being the WHO/JMP term of art for a
   * protected water source - the first run of this test caught exactly that
   * usage. The question was reworded to "protected" rather than the term
   * being dropped from this list, because "protected" is also plainer
   * English for a player, and because a word that asserts a direction is
   * worth keeping banned even at the cost of an occasional reword.
   */
  "improved",
  "worsened",
  "collapse",
  "boom",
  "plummet",
  "soar",
];

test("no imported question reveals which way the line goes", () => {
  const offenders: string[] = [];

  for (const dataset of generatedDatasets) {
    const question = dataset.question.toLowerCase();
    for (const term of LEADING_TERMS) {
      if (question.includes(term)) {
        offenders.push(`${dataset.slug}: contains "${term}" - ${dataset.question}`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    "A question must describe what is measured, never which way it moved. " +
      "See the framing rule in scripts/wb-catalogue.ts.\n" +
      offenders.join("\n"),
  );
});

test("every imported question names the reveal boundary year", () => {
  /*
   * The generator substitutes {year} from xValues[revealFromIndex] precisely
   * so the prompt and the chart can never disagree about where the drawing
   * starts - a bug this project already shipped once, in Session 5, when
   * boundary years were written by hand per dataset.
   */
  for (const dataset of generatedDatasets) {
    const boundary = dataset.xValues[dataset.revealFromIndex];
    assert.ok(
      dataset.question.includes(boundary),
      `${dataset.slug}: question does not name its reveal year ${boundary}`,
    );
    assert.ok(
      !dataset.question.includes("{year}") && !dataset.question.includes("{country}"),
      `${dataset.slug}: question still has an unsubstituted placeholder`,
    );
  }
});

/**
 * Duplicate guards.
 *
 * Reported 2026-08-27 with a screenshot of the admin list showing "Births per
 * woman in Bangladesh" twice, both citing worldbank:SP.DYN.TFRT.IN:BGD. The
 * cause was that the importer deduplicated on SLUG only, while the old
 * catalogue held two specs for the same indicator whose slug stems differed
 * (`fertility-rate` and `fertility-rate-asia`), each with BGD in its country
 * list. Two rows, one series, identical on screen.
 *
 * That is worse than untidy. A player can be served the same question twice,
 * and the dataset's guesses split across two aggregates so neither reaches
 * CROWD_MIN_N when their sum would have.
 *
 * The importer now rejects on all three keys. These tests assert the property
 * on the shipped bundle, so a hand-edit or a future importer change cannot
 * reintroduce it silently.
 */
function findDuplicates<T>(items: T[], key: (item: T) => string): string[] {
  const seen = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    seen.set(k, (seen.get(k) ?? 0) + 1);
  }
  return [...seen.entries()]
    .filter(([, count]) => count > 1)
    .map(([k, count]) => `${k} (x${count})`);
}

test("no two imported charts show the same series", () => {
  assert.deepEqual(
    findDuplicates(generatedDatasets, (d) => d.sourceSeriesId ?? d.slug),
    [],
    "The same indicator and country must not be imported twice under " +
      "different slugs - see the Bangladesh fertility case in this file's notes.",
  );
});

test("no two imported charts share a title or a question", () => {
  assert.deepEqual(findDuplicates(generatedDatasets, (d) => d.title), []);
  assert.deepEqual(
    findDuplicates(generatedDatasets, (d) => `${d.title} :: ${d.question}`),
    [],
  );
});

test("no two imported charts carry identical data", () => {
  /*
   * The strongest form of the check: two charts with different names and
   * different indicator codes that nonetheless plot the exact same numbers
   * are still the same question to a player.
   */
  assert.deepEqual(
    findDuplicates(
      generatedDatasets,
      (d) => `${d.xValues.join(",")}|${d.yValues.join(",")}`,
    ),
    [],
  );
});

test("imported titles read as English, not as API country codes", () => {
  for (const dataset of generatedDatasets) {
    assert.ok(
      !/\bin World\b|\bin United States\b|\bof World\b/.test(dataset.title),
      `${dataset.slug}: title reads as raw API name - "${dataset.title}"`,
    );
  }
});
