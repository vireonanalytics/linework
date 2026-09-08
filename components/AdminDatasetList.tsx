"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminSparkline } from "@/components/AdminSparkline";
import { AdminVerifyToggle } from "@/components/AdminVerifyToggle";
import { AdminRetireToggle } from "@/components/AdminRetireToggle";
import { shortJustification } from "@/lib/datasets/justification";
import type { AdminDatasetRow } from "@/lib/server/db";

/**
 * Client-side search over an already-fetched list. 21 datasets today,
 * comfortably under the size where a server round trip per keystroke would
 * ever be worth it - if this list grows into the hundreds, that tradeoff is
 * worth revisiting, not before.
 */
/**
 * Sort options, added 2026-08-27: "the graphs on admin panel should have
 * filters like the most played, the most inaccurate on average."
 *
 * Every comparator sorts on CLEAN guesses only, matching what a published
 * aggregate would use - a dataset should not rank as "most played" on the
 * strength of guesses that are excluded from every finding.
 *
 * Datasets with no responses sort last in every data-driven order rather
 * than first: an empty dataset has no average to be extreme, and letting
 * nulls float to the top would bury the rows the admin opened this page to
 * find.
 */
const SORTS = {
  title: { label: "Title (A-Z)" },
  played: { label: "Most played" },
  inaccurate: { label: "Most inaccurate" },
  overestimated: { label: "Most overestimated" },
  underestimated: { label: "Most underestimated" },
  flagged: { label: "Most flagged" },
} as const;

type SortKey = keyof typeof SORTS;

function compareBy(key: SortKey) {
  return (a: AdminDatasetRow, b: AdminDatasetRow): number => {
    const an = a.analysis;
    const bn = b.analysis;

    switch (key) {
      case "played":
        return bn.cleanGuessCount - an.cleanGuessCount;

      case "flagged":
        return bn.suspectCount - an.suspectCount;

      case "inaccurate": {
        // Lowest average score first. "Inaccurate" is about how far people
        // were from the truth in either direction, which is what score
        // already measures - signed error would cancel a crowd that was
        // wildly wrong in both directions out to roughly zero.
        if (an.avgScore === null) return 1;
        if (bn.avgScore === null) return -1;
        return an.avgScore - bn.avgScore;
      }

      case "overestimated": {
        if (an.avgSignedError === null) return 1;
        if (bn.avgSignedError === null) return -1;
        return bn.avgSignedError - an.avgSignedError;
      }

      case "underestimated": {
        if (an.avgSignedError === null) return 1;
        if (bn.avgSignedError === null) return -1;
        return an.avgSignedError - bn.avgSignedError;
      }

      case "title":
      default:
        return a.title.localeCompare(b.title);
    }
  };
}

const RELIABILITY_FILTERS = {
  all: "Any reliability",
  green: "Green only",
  yellow: "Yellow only",
  red: "Red only",
} as const;

type ReliabilityFilter = keyof typeof RELIABILITY_FILTERS;

export function AdminDatasetList({ datasets }: { datasets: AdminDatasetRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("title");
  const [reliability, setReliability] = useState<ReliabilityFilter>("all");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  /*
   * Retired charts are excluded from the offer. activateGreenDatasets() skips
   * them server-side, so counting them here would advertise a button that
   * activates fewer charts than its own label promises.
   */
  const greenInactive = datasets.filter(
    (d) => d.reliability === "green" && !d.isActive && d.retiredAt === null,
  ).length;

  const runBulk = async (action: "activate-green" | "deactivate-imported") => {
    if (action === "activate-green") {
      const ok = window.confirm(
        `Verify and activate ${greenInactive} green datasets?\n\n` +
          "Green means the values are the source's own published numbers, " +
          "fetched from a named indicator and never interpolated. This marks " +
          "them verified and makes them playable.",
      );
      if (!ok) return;
    }
    setBulkBusy(true);
    setBulkError(null);
    try {
      const res = await fetch("/api/admin/datasets/activate-green", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        setBulkError(b.error ?? `request failed (${res.status})`);
        return;
      }
      router.refresh();
    } catch {
      setBulkError("network unavailable");
    } finally {
      setBulkBusy(false);
    }
  };

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const byReliability =
      reliability === "all"
        ? datasets
        : datasets.filter((d) => d.reliability === reliability);
    const matched = !needle
      ? byReliability
      : byReliability.filter(
          (d) =>
            d.title.toLowerCase().includes(needle) ||
            d.slug.toLowerCase().includes(needle) ||
            d.sourceName.toLowerCase().includes(needle),
        );
    // Copy before sorting - Array.prototype.sort mutates, and `datasets` is
    // a prop owned by the server component above.
    return [...matched].sort(compareBy(sort));
  }, [datasets, query, sort, reliability]);

  /*
   * This list used to split on `verified` alone and label the second half
   * "Verified & live". Once retirement existed those two words came apart: a
   * retired chart keeps verified = true (its data was never the problem) but
   * is not served. The panel consequently reported 564 charts while the game
   * was serving 275 - the count was real, the label was a lie.
   *
   * Retired charts are no longer fetched by this page at all; they have their
   * own panel at /admin/datasets/retired. The `retiredAt === null` guards
   * below are kept as a belt-and-braces assertion of what this list means,
   * so that a future query change cannot silently reintroduce the same
   * mislabelling.
   */
  const unverified = filtered.filter((d) => d.retiredAt === null && !d.verified);
  const live = filtered.filter((d) => d.retiredAt === null && d.verified);

  return (
    <div className="stack-5">
      <div className="controls">
        <div className="field admin-search-field">
          <label className="field-label" htmlFor="admin-search">Search datasets</label>
          <input
            id="admin-search"
            className="field-input admin-search"
            type="search"
            placeholder="Title, slug, or source..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="admin-reliability">Reliability</label>
          <select
            id="admin-reliability"
            className="field-input"
            value={reliability}
            onChange={(e) => setReliability(e.target.value as ReliabilityFilter)}
          >
            {Object.entries(RELIABILITY_FILTERS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="admin-sort">Sort by</label>
          <select
            id="admin-sort"
            className="field-input"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            {Object.entries(SORTS).map(([key, { label }]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {greenInactive > 0 || datasets.some((d) => d.sourceSeriesId && d.isActive) ? (
        <div className="card stack-3">
          <p className="eyebrow">Bulk actions</p>
          <p className="admin-row-justification">
            {greenInactive} green dataset{greenInactive === 1 ? "" : "s"} are
            imported and rated green but not yet live. Green means the values
            are the source&apos;s own published numbers, fetched from a named
            indicator and never interpolated.
          </p>
          {bulkError ? <p className="field-error" role="alert">{bulkError}</p> : null}
          <div className="controls">
            {greenInactive > 0 ? (
              <button
                type="button"
                className="button button--primary"
                disabled={bulkBusy}
                onClick={() => runBulk("activate-green")}
              >
                Verify &amp; activate {greenInactive} green
              </button>
            ) : null}
            <button
              type="button"
              className="button"
              disabled={bulkBusy}
              onClick={() => runBulk("deactivate-imported")}
            >
              Deactivate all imported
            </button>
          </div>
        </div>
      ) : null}

      <section className="stack-4" aria-label="Unverified datasets">
        <p className="eyebrow">Unverified ({unverified.length})</p>
        {unverified.length === 0 ? (
          <p className="note">Nothing matches.</p>
        ) : (
          <div className="stack-2">
            {unverified.map((d) => (
              <DatasetRow key={d.slug} dataset={d} />
            ))}
          </div>
        )}
      </section>

      <section className="stack-4" aria-label="Verified and live datasets">
        <p className="eyebrow">Verified &amp; live ({live.length})</p>
        {live.length === 0 ? (
          <p className="note">Nothing matches.</p>
        ) : (
          <div className="stack-2">
            {live.map((d) => (
              <DatasetRow key={d.slug} dataset={d} />
            ))}
          </div>
        )}
      </section>

    </div>
  );
}

function DatasetRow({ dataset }: { dataset: AdminDatasetRow }) {
  const { analysis } = dataset;
  const totalGuesses = analysis.cleanGuessCount + analysis.suspectCount;

  return (
    <article className="admin-row">
      <div className="admin-row-chart">
        <AdminSparkline
          yValues={dataset.yValues}
          yDomain={dataset.yDomain}
          revealFromIndex={dataset.revealFromIndex}
        />
      </div>

      <div className="admin-row-body">
        <p className="admin-row-title">
          {dataset.title}
          <span className={`rel rel--${dataset.reliability}`} title={dataset.reliabilityNote ?? "Source's own values, reproducibly fetched"}>
            {dataset.reliability}
          </span>
        </p>
        <p className="admin-row-meta">
          <a href={dataset.sourceUrl} target="_blank" rel="noreferrer noopener">
            {dataset.sourceName}
          </a>
          {" · "}
          {dataset.retiredAt
            ? `Retired ${dataset.retiredAt.slice(0, 10)} - not served`
            : dataset.verified
              ? `Verified ${dataset.verifiedOn ?? ""}`.trim()
              : "Unverified"}
        </p>
        <p className="admin-row-justification">
          {shortJustification(dataset.methodologyNote)}
        </p>
        <p className="admin-analysis">
          {totalGuesses === 0
            ? "No guesses yet"
            : `${analysis.cleanGuessCount} clean (${analysis.registeredCount} registered, ${analysis.anonymousCount} anonymous), ${analysis.suspectCount} flagged` +
              (analysis.avgScore !== null
                ? ` · avg score ${analysis.avgScore.toFixed(0)}, avg signed error ${analysis.avgSignedError!.toFixed(3)}`
                : "")}
        </p>
      </div>

      <div className="stack-2">
        <a className="button" href={`/admin/datasets/${dataset.slug}`}>
          View analysis
        </a>
        {/* Preview, never recorded - see components/AdminPreviewPlay.tsx. */}
        <a className="button" href={`/admin/play/${dataset.slug}`}>
          Play
        </a>
        {/*
          Plain links, not fetch()-and-blob: the browser's own download
          handling gives a real progress indicator and streams straight to
          disk, which matters once a dataset has tens of thousands of rows.
          The route sets Content-Disposition; `download` is belt and braces.
        */}
        {totalGuesses > 0 ? (
          <div className="controls">
            <a
              className="button"
              href={`/api/admin/datasets/${dataset.slug}/export`}
              download
            >
              CSV
            </a>
            <a
              className="button"
              href={`/api/admin/datasets/${dataset.slug}/export?format=json`}
              download
            >
              JSON
            </a>
          </div>
        ) : null}
        {/*
          A retired chart cannot be verified into circulation - the route
          refuses it and the constraint backs that up - so offering the
          verify button here would be offering an action that cannot succeed.
          Restore first, then verify: two deliberate steps to put something
          back in front of players.
        */}
        {dataset.retiredAt === null ? (
          <AdminVerifyToggle slug={dataset.slug} verified={dataset.verified} />
        ) : null}
        <AdminRetireToggle
          slug={dataset.slug}
          retired={dataset.retiredAt !== null}
        />
      </div>
    </article>
  );
}
