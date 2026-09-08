import assert from "node:assert/strict";
import { test } from "node:test";
import { CHART_THEME_COUNT, chartThemeClass } from "./palette.ts";
import { allDatasets } from "../datasets/index.ts";

test("the same slug always gets the same theme", () => {
  assert.equal(
    chartThemeClass("us-gun-homicide-rate"),
    chartThemeClass("us-gun-homicide-rate"),
  );
});

test("every theme returned is one that actually exists in tokens.css", () => {
  for (const dataset of allDatasets) {
    const cls = chartThemeClass(dataset.slug);
    const n = Number(cls.replace("chart-theme--", ""));
    assert.ok(
      Number.isInteger(n) && n >= 1 && n <= CHART_THEME_COUNT,
      `${dataset.slug} produced ${cls}, which has no matching class`,
    );
  }
});

test("an empty slug degrades to a real theme instead of throwing", () => {
  assert.equal(chartThemeClass(""), "chart-theme--1");
});

test("adjacent datasets in the registry do not all collapse to one colour", () => {
  // The point of the feature is visible variety. If the hash were broken (or
  // the modulo wrong) every dataset could land on the same theme and the
  // whole thing would silently look exactly like it did before.
  const used = new Set(allDatasets.map((d) => chartThemeClass(d.slug)));
  assert.ok(
    used.size >= 4,
    `21 datasets only produced ${used.size} distinct themes - the spread is too narrow to read as variety`,
  );
});

test("real slugs spread across themes rather than clustering on one", () => {
  const counts = new Map<string, number>();
  for (const dataset of allDatasets) {
    const cls = chartThemeClass(dataset.slug);
    counts.set(cls, (counts.get(cls) ?? 0) + 1);
  }
  // No single theme should own more than half the set.
  for (const [cls, n] of counts) {
    assert.ok(
      n <= Math.ceil(allDatasets.length / 2),
      `${cls} is used by ${n} of ${allDatasets.length} datasets`,
    );
  }
});
