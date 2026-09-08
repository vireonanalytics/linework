"use client";

import { useMemo, useState } from "react";
import { AdminSparkline } from "@/components/AdminSparkline";
import { AdminRetireToggle } from "@/components/AdminRetireToggle";
import type { AdminDatasetRow } from "@/lib/server/db";

/**
 * The archive of withdrawn charts.
 *
 * Split onto its own page (2026-08-27) after the retired group was reported
 * missing. It DID exist - as a third section below 275 live rows on the main
 * admin page - which is the same as not existing. An admin who deactivates a
 * chart needs to be able to find it again immediately, not scroll past
 * everything that is still live.
 *
 * Nothing here is deleted. Every retired chart keeps its full series and
 * every guess ever recorded against it; this page is the way back.
 */
const REASONS = {
  all: "Any reason",
  admin: "Deactivated by an admin",
  catalogue: "Dropped from the import",
} as const;

type ReasonFilter = keyof typeof REASONS;

export function AdminRetiredList({ datasets }: { datasets: AdminDatasetRow[] }) {
  const [query, setQuery] = useState("");
  const [reason, setReason] = useState<ReasonFilter>("all");

  const byAdmin = datasets.filter((d) => d.retiredReason === "admin").length;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const byReason =
      reason === "all"
        ? datasets
        : datasets.filter((d) => d.retiredReason === reason);
    if (!needle) return byReason;
    return byReason.filter(
      (d) =>
        d.title.toLowerCase().includes(needle) ||
        d.slug.toLowerCase().includes(needle) ||
        d.sourceName.toLowerCase().includes(needle),
    );
  }, [datasets, query, reason]);

  return (
    <div className="stack-5">
      <div className="card stack-3">
        <p className="eyebrow">Nothing here is deleted</p>
        <p className="admin-row-justification">
          These charts are stored in full - their data and every answer players
          gave them. They are simply not served to anyone and do not appear in
          any player&apos;s answer history. Restoring one returns it to the main
          list as inactive; verifying it there puts it back in front of players.
        </p>
        <p className="admin-analysis">
          {datasets.length} retired · {byAdmin} deactivated by an admin ·{" "}
          {datasets.length - byAdmin} dropped from the import catalogue
        </p>
      </div>

      <div className="controls">
        <div className="field admin-search-field">
          <label className="field-label" htmlFor="retired-search">
            Search retired charts
          </label>
          <input
            id="retired-search"
            className="field-input admin-search"
            type="search"
            placeholder="Title, slug, or source..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="retired-reason">
            Reason
          </label>
          <select
            id="retired-reason"
            className="field-input"
            value={reason}
            onChange={(e) => setReason(e.target.value as ReasonFilter)}
          >
            {Object.entries(REASONS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <section className="stack-4" aria-label="Retired datasets">
        <p className="eyebrow">Showing {filtered.length}</p>
        {filtered.length === 0 ? (
          <p className="note">Nothing matches.</p>
        ) : (
          <div className="stack-2">
            {filtered.map((d) => (
              <RetiredRow key={d.slug} dataset={d} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function RetiredRow({ dataset }: { dataset: AdminDatasetRow }) {
  const { analysis } = dataset;
  const total = analysis.cleanGuessCount + analysis.suspectCount;

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
          <span className={`rel rel--${dataset.reliability}`}>
            {dataset.reliability}
          </span>
        </p>
        <p className="admin-row-meta">
          <a href={dataset.sourceUrl} target="_blank" rel="noreferrer noopener">
            {dataset.sourceName}
          </a>
          {" · "}
          {dataset.retiredReason === "admin"
            ? `Deactivated by an admin on ${dataset.retiredAt?.slice(0, 10)}`
            : `Dropped from the import catalogue on ${dataset.retiredAt?.slice(0, 10)}`}
        </p>
        <p className="admin-analysis">
          {total === 0
            ? "No answers were recorded for this chart"
            : `${total} answer${total === 1 ? "" : "s"} kept (${analysis.cleanGuessCount} clean, ${analysis.suspectCount} flagged)`}
        </p>
      </div>

      <div className="stack-2">
        {/*
          The analysis link stays available. A retired chart's collected
          answers are still research data, and withdrawing the chart from
          play is not a reason to make them unreachable.
        */}
        {total > 0 ? (
          <a className="button" href={`/admin/datasets/${dataset.slug}`}>
            View analysis
          </a>
        ) : null}
        <AdminRetireToggle slug={dataset.slug} retired />
      </div>
    </article>
  );
}
