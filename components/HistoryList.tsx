"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { HistorySparkline } from "@/components/HistorySparkline";
import type { HistoryEntry } from "@/lib/server/db";

/**
 * Search and filter over a player's answered charts.
 *
 * Filtering happens client-side over the already-fetched list, the same
 * decision AdminDatasetList made and for the same reason: a player has tens
 * of answers, not thousands, so a server round trip per keystroke would be
 * solving a problem this project does not have. If someone ever accumulates
 * enough history for this to feel slow, the fix is pagination on the server,
 * not a debounce here.
 */
type SortKey = "recent" | "oldest" | "best" | "worst";

const SORTS: Record<SortKey, string> = {
  recent: "Most recent",
  oldest: "Oldest first",
  best: "Best score",
  worst: "Worst score",
};

type DirectionKey = "all" | "high" | "low" | "on";

const DIRECTIONS: Record<DirectionKey, string> = {
  all: "Any result",
  high: "Drew too high",
  low: "Drew too low",
  on: "On the line",
};

/**
 * The same epsilon DrawTheLine and lib/crowd/compare.ts already use for
 * "too high / too low / on the line". Hard-coding a different one here would
 * let this page disagree with the result screen about the same guess.
 */
const BIAS_EPSILON = 0.01;

function directionOf(meanSignedError: number): DirectionKey {
  if (meanSignedError > BIAS_EPSILON) return "high";
  if (meanSignedError < -BIAS_EPSILON) return "low";
  return "on";
}

export function HistoryList({ entries }: { entries: HistoryEntry[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [direction, setDirection] = useState<DirectionKey>("all");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();

    const matched = entries.filter((entry) => {
      if (direction !== "all" && directionOf(entry.meanSignedError) !== direction) {
        return false;
      }
      if (!needle) return true;
      return (
        entry.title.toLowerCase().includes(needle) ||
        entry.question.toLowerCase().includes(needle) ||
        entry.slug.toLowerCase().includes(needle)
      );
    });

    // Copy before sorting - `entries` is a prop owned by the server component.
    return [...matched].sort((a, b) => {
      switch (sort) {
        case "oldest":
          return a.playedAt.localeCompare(b.playedAt);
        case "best":
          return b.score - a.score;
        case "worst":
          return a.score - b.score;
        case "recent":
        default:
          return b.playedAt.localeCompare(a.playedAt);
      }
    });
  }, [entries, query, sort, direction]);

  return (
    <div className="stack-5">
      <div className="controls">
        <div className="field admin-search-field">
          <label className="field-label" htmlFor="history-search">
            Search your answers
          </label>
          <input
            id="history-search"
            className="field-input admin-search"
            type="search"
            placeholder="Chart title or topic..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="history-direction">Result</label>
          <select
            id="history-direction"
            className="field-input"
            value={direction}
            onChange={(e) => setDirection(e.target.value as DirectionKey)}
          >
            {Object.entries(DIRECTIONS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="history-sort">Sort by</label>
          <select
            id="history-sort"
            className="field-input"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            {Object.entries(SORTS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      <p className="note" aria-live="polite">
        {visible.length === entries.length
          ? `${entries.length} chart${entries.length === 1 ? "" : "s"}`
          : `${visible.length} of ${entries.length} charts`}
      </p>

      {visible.length === 0 ? (
        <p className="question">Nothing matches that. Try a different search.</p>
      ) : (
        <ul className="history-list">
          {/*
            The whole row is the link, not a small "view" button beside it.
            Every part of a row refers to the same one thing, so making only a
            corner clickable is a target people miss - and this is also the
            page someone returns to later to check whether the crowd arrived.

            The comment sits HERE rather than inside the map callback: a JSX
            expression container is not a valid standalone item where one
            expression is required, which is a build break this project has
            now hit three times.
          */}
          {visible.map((entry) => (
            <li className="history-row" key={entry.guessId}>
              <Link
                className="history-row-link"
                href={`/history/${entry.guessId}`}
                aria-label={`Open your answer for ${entry.title}`}
              />
              <HistorySparkline
                slug={entry.slug}
                yValues={entry.yValues}
                yDomain={entry.yDomain}
                revealFromIndex={entry.revealFromIndex}
                path={entry.path}
              />
              <div className="history-body">
                <p className="history-title">{entry.title}</p>
                <p className="admin-row-meta">
                  {new Date(entry.playedAt).toLocaleDateString()}
                  {" · "}
                  {DIRECTIONS[directionOf(entry.meanSignedError)]}
                  {entry.isSuspect ? " · not counted" : ""}
                </p>
              </div>
              <p className="history-score">
                <span className="score-mark">{entry.score}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
