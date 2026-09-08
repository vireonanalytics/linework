# Analysis queries

Read-only SQL against the Linework production database. Nothing here writes,
creates or drops anything: every statement is a `SELECT`, and no file depends
on having run another one first.

See [`../SCHEMA.md`](../SCHEMA.md) for what the columns mean and
[`../FINDINGS.md`](../FINDINGS.md) for what they currently say.

## Running

```bash
psql "$DATABASE_URL" -f analysis/01_response_summary.sql
```

Each file holds several independent statements. They are meant to be read and
run one at a time rather than executed as a batch, because most of them need
their comments read alongside the result.

## The files

| File | Answers |
|---|---|
| `01_response_summary.sql` | Sample size. Totals, per-question counts, date range |
| `02_divergence.sql` | How far people's lines sat from the truth, ranked |
| `03_divergence_by_segment.sql` | Does that vary by device, country, referrer, position, hour |
| `04_funnel.sql` | Where people stop, step to step |
| `05_directional_bias.sql` | Do people systematically draw high or low |
| `06_session_behavior.sql` | Draw time, revision, return visits |
| `07_shape_of_error.sql` | *Where along the chart* people go wrong |
| `08_data_quality.sql` | Flag rates and why rows were excluded |
| `09_crowd_readiness.sql` | How close each chart is to the crowd threshold |
| `10_demographics.sql` | Divergence by age and state, signed-in players only |
| `11_engagement_and_streaks.sql` | Retention, and an audit of the streak columns |
| `12_catalogue_coverage.sql` | Which questions earn their slot in the rotation |
| `13_integrity_checks.sql` | Assertions. **Every statement should return zero rows** |

## Rules these queries follow

**Run `01` first, every time.** Every other result is meaningless until the
sample size is large enough to support it. Most files carry a
`HAVING count(*) >= 5` floor and will legitimately return nothing until there
is data; that is the floor working, not a broken query.

**Clean means `NOT is_suspect`.** Flagged rows are stored but excluded from
every aggregate, which is the rule the codebase has enforced since the schema
was written. `08_data_quality.sql` is the one file that deliberately looks at
what the filter removed.

**Normalised units are for ranking, chart units are for quoting.**
`mean_abs_error` is 0..1 across the chart's own y-axis, which is the only form
comparable across questions and is meaningless to a reader. Queries that report
a headline figure give both.

**Positive signed error means the player drew ABOVE the truth.** Which is not
the same as "overestimated the problem" — that depends on which way is good on
that particular chart, and no query decides it for you.

**Never publish a segment cut without the within-question version.** Charts
differ enormously in difficulty and chart order is randomised per user, so two
segments will have answered different question sets. A raw comparison can be
entirely an artefact of that. `03` section 6 and `10` section 4 are the forms
that control for it.

**Minimum cell sizes are a privacy floor, not just a statistical one.** With a
small user base a city cell can contain exactly one person. Raise the floors in
`10_demographics.sql` before publishing, never lower them.

**Nothing in this directory is safe to publish as-is.** Some queries select
email addresses, because they are operator queries run by the person who owns
the database. The path that deliberately drops every identifier is the export
route, `/api/admin/datasets/[slug]/export`.

## The duplicated CTE

`07_shape_of_error.sql` and `13_integrity_checks.sql` both contain a copy of
the truth-resampling logic, which mirrors `truthPathNormalized()` in
`lib/scoring/score.ts`.

That is three implementations of one definition, and nothing automatically
keeps them in step. It is duplicated rather than factored into a view so that
each file stays runnable by pasting it into a client, with no setup step.

`13_integrity_checks.sql` section 1 is the check that they agree: it recomputes
every stored score from the raw path and compares. Run it after touching any of
the three.
