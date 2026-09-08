import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { crowdForDataset, datasetDetailForAdmin, type AdminDatasetFilters } from "@/lib/server/db";
import { inferBiasStatement } from "@/lib/crowd/insight";
import { AdminSparkline } from "@/components/AdminSparkline";
import { US_STATES } from "@/lib/geo/us-states";

export const dynamic = "force-dynamic";

function firstValue(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

function parseAge(value: string | string[] | undefined): number | null {
  const raw = firstValue(value);
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/**
 * "For every question in the admin tab, I should be able to access it and
 * see how replies are looking right now and what can be inferred from it"
 * (2026-08-26). This is the actual research deliverable this project is
 * built to produce - the admin list (components/AdminDatasetList.tsx) stays
 * a short, scannable overview on purpose; this page is where an admin drills
 * into one question and reads the aggregate finding, e.g. "on average
 * respondents overestimated this trend by N points."
 *
 * Filters (state/city/age, added 2026-08-26) are a plain GET form back to
 * this same URL - no client JS needed, the filter state lives entirely in
 * the query string, and reloading or sharing the URL preserves it. See
 * lib/server/db.ts's demographicCondition() for why activating any filter
 * implicitly restricts to signed-in players with a matching profile.
 */
export default async function AdminDatasetDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/signin?callbackUrl=/admin");
  if (session.user.role !== "admin") redirect("/");

  const { slug } = await params;
  const sp = await searchParams;

  const filters: AdminDatasetFilters = {
    state: firstValue(sp.state),
    city: firstValue(sp.city),
    ageMin: parseAge(sp.ageMin),
    ageMax: parseAge(sp.ageMax),
  };
  const filtersActive =
    filters.state !== null ||
    filters.city !== null ||
    filters.ageMin !== null ||
    filters.ageMax !== null;

  const detail = await datasetDetailForAdmin(slug, filters);
  if (!detail) notFound();

  const crowd = await crowdForDataset(detail.id);
  const { analysis } = detail;
  const statement = inferBiasStatement(analysis.avgSignedError, analysis.cleanGuessCount);

  return (
    <main className="page">
      <div className="frame stack-5">
        <header className="stack-2">
          <p className="eyebrow">
            <a href="/admin">&larr; All datasets</a>
          </p>
          <h1 className="title">{detail.title}</h1>
          <p className="question">{detail.question}</p>
          <p className="admin-row-meta">
            <a href={detail.sourceUrl} target="_blank" rel="noreferrer noopener">
              {detail.sourceName}
            </a>
            {" · "}
            {detail.verified ? `Verified ${detail.verifiedOn ?? ""}`.trim() : "Unverified"}
            {" · "}
            {detail.isActive ? "Active" : "Not active"}
          </p>
        </header>

        <section className="stack-2" aria-label="Filter by demographics">
          <p className="eyebrow">Filter by respondent</p>
          <form className="stack-2">
            <div className="controls">
              <div className="field">
                <label className="field-label" htmlFor="filter-state">State</label>
                <select
                  id="filter-state"
                  name="state"
                  className="field-input"
                  defaultValue={filters.state ?? ""}
                >
                  <option value="">All states</option>
                  {US_STATES.map((s) => (
                    <option key={s.abbr} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="filter-city">City</label>
                <input
                  id="filter-city"
                  name="city"
                  type="text"
                  className="field-input"
                  defaultValue={filters.city ?? ""}
                  placeholder="Any city"
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="filter-age-min">Age min</label>
                <input
                  id="filter-age-min"
                  name="ageMin"
                  type="number"
                  className="field-input"
                  defaultValue={filters.ageMin ?? ""}
                  min={0}
                  max={130}
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="filter-age-max">Age max</label>
                <input
                  id="filter-age-max"
                  name="ageMax"
                  type="number"
                  className="field-input"
                  defaultValue={filters.ageMax ?? ""}
                  min={0}
                  max={130}
                />
              </div>
            </div>
            <div className="controls">
              <button type="submit" className="button button--primary">
                Apply filters
              </button>
              {filtersActive ? (
                <a className="button" href={`/admin/datasets/${slug}`}>
                  Clear filters
                </a>
              ) : null}
            </div>
          </form>
          {filtersActive ? (
            <p className="note">
              Filtered - only signed-in players whose profile matches every
              filter above are included. Anonymous guesses and signed-in
              players missing a matching field (e.g. no birth year on file)
              are excluded while a filter is active.
            </p>
          ) : null}
        </section>

        <section className="stack-2" aria-label="Finding">
          <p className="eyebrow">What this data shows so far</p>
          <p className="admin-finding">{statement}</p>
        </section>

        <section className="stack-2" aria-label="Sample">
          <p className="eyebrow">Sample</p>
          <dl className="metrics">
            <div>
              <dt className="metric-term">Clean responses</dt>
              <dd className="metric-value">{analysis.cleanGuessCount}</dd>
            </div>
            <div>
              <dt className="metric-term">Registered / anonymous</dt>
              <dd className="metric-value">
                {analysis.registeredCount} / {analysis.anonymousCount}
              </dd>
            </div>
            <div>
              <dt className="metric-term">Flagged (excluded above)</dt>
              <dd className="metric-value">{analysis.suspectCount}</dd>
            </div>
            <div>
              <dt className="metric-term">Avg score</dt>
              <dd className="metric-value">{analysis.avgScore?.toFixed(1) ?? "—"}</dd>
            </div>
            <div>
              <dt className="metric-term">Median score</dt>
              <dd className="metric-value">{detail.medianScore?.toFixed(1) ?? "—"}</dd>
            </div>
            <div>
              <dt className="metric-term">Avg signed error</dt>
              <dd className="metric-value">{analysis.avgSignedError?.toFixed(3) ?? "—"}</dd>
            </div>
            <div>
              <dt className="metric-term">Signed error stdev</dt>
              <dd className="metric-value">{detail.stdevSignedError?.toFixed(3) ?? "—"}</dd>
            </div>
          </dl>
        </section>

        {detail.suspectBreakdown.length > 0 ? (
          <section className="stack-2" aria-label="Flag reasons">
            <p className="eyebrow">Why guesses were flagged (excluded above)</p>
            <div className="stack-2">
              {detail.suspectBreakdown.map((r) => (
                <p key={r.reason} className="note">
                  {r.reason}: {r.count}
                </p>
              ))}
            </div>
          </section>
        ) : null}

        <section className="stack-2" aria-label="Chart preview">
          <p className="eyebrow">How the chart looks</p>
          <AdminSparkline
            yValues={detail.yValues}
            yDomain={detail.yDomain}
            revealFromIndex={detail.revealFromIndex}
            width={480}
            height={120}
          />
        </section>

        <section className="stack-2" aria-label="Crowd sample">
          <p className="eyebrow">Public crowd view</p>
          {crowd.belowThreshold ? (
            <p className="note">
              Only {crowd.n} clean {crowd.n === 1 ? "guess" : "guesses"} in the
              precomputed crowd sample so far - the public game needs at
              least {crowd.minRequired} before it shows this view to players.
              The counts above are live and not subject to that threshold.
            </p>
          ) : (
            <p className="note">
              {crowd.n} guesses in the crowd sample, last recomputed{" "}
              {new Date(crowd.computedAt).toLocaleString()}.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
