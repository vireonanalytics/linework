"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { AdminPlayRow } from "@/lib/server/db";

/**
 * Every chart, filterable, each one openable in the non-recording preview.
 *
 * Filtered on the client over an already-fetched list. That is the opposite
 * call from allDatasetsForAdmin, which splits live and retired in SQL - but
 * the reason there was payload size (a full series per row for the sparkline),
 * and AdminPlayRow deliberately carries no series and no aggregates. 585 of
 * these rows is a small amount of text, and filtering them in the browser
 * makes the picker instant, which is the whole point of a picker.
 */

const STATUS = {
  all: "All charts",
  rotation: "In rotation",
  held: "Held back",
  unverified: "Unverified",
  retired: "Retired",
} as const;

type StatusKey = keyof typeof STATUS;

/** The one status word that describes a chart, most specific first. */
function statusOf(d: AdminPlayRow): { key: Exclude<StatusKey, "all">; label: string } {
  if (d.retiredAt !== null) return { key: "retired", label: "Retired" };
  if (!d.verified) return { key: "unverified", label: "Unverified" };
  if (!d.isActive) return { key: "unverified", label: "Inactive" };
  if (!d.inRotation) return { key: "held", label: "Held back" };
  return { key: "rotation", label: "In rotation" };
}

export function AdminPlayList({ charts }: { charts: AdminPlayRow[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusKey>("all");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return charts.filter((d) => {
      if (status !== "all" && statusOf(d).key !== status) return false;
      if (q === "") return true;
      return (
        d.title.toLowerCase().includes(q) ||
        d.slug.toLowerCase().includes(q) ||
        d.sourceName.toLowerCase().includes(q)
      );
    });
  }, [charts, query, status]);

  return (
    <div className="stack-4">
      <div className="controls">
        <div className="field admin-search-field">
          <label className="field-label" htmlFor="admin-play-search">
            Search charts
          </label>
          <input
            id="admin-play-search"
            className="field-input admin-search"
            type="search"
            placeholder="Title, slug, or source..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="admin-play-status">
            Status
          </label>
          <select
            id="admin-play-status"
            className="field-input"
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusKey)}
          >
            {Object.entries(STATUS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="note">
        {shown.length} of {charts.length} charts
      </p>

      {shown.length === 0 ? (
        <p className="note">Nothing matches.</p>
      ) : (
        <div className="stack-2">
          {shown.map((d) => {
            const s = statusOf(d);
            return (
              <article key={d.slug} className="admin-row">
                <div className="admin-row-body">
                  <p className="admin-row-title">
                    {d.title}
                    <span
                      className={`rel rel--${d.reliability}`}
                      title={`Reliability: ${d.reliability}`}
                    >
                      {d.reliability}
                    </span>
                  </p>
                  <p className="admin-row-meta">
                    {d.sourceName}
                    {" · "}
                    {s.label}
                    {" · "}
                    {d.guessCount === 0
                      ? "no answers yet"
                      : `${d.guessCount} ${d.guessCount === 1 ? "answer" : "answers"}`}
                  </p>
                </div>

                <div className="controls">
                  <Link
                    className="button button--primary"
                    href={`/admin/play/${d.slug}`}
                  >
                    Play
                  </Link>
                  <Link className="button" href={`/admin/datasets/${d.slug}`}>
                    Analysis
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
