# Findings

What the collected data currently supports, and what it does not.

**Snapshot: 2 September 2026.** Every number below came from running the
queries in [`analysis/`](analysis/) against the production database on that
date. Nothing here is hand-typed from memory, and nothing is estimated.

---

## The headline is that there is no headline yet

> **102 responses. 2 respondents. 89 different questions. Zero charts have
> enough data to publish anything about.**

That is the finding. Everything else in this document is either a
methodological result about whether the instrument works, or a number reported
with the explicit caveat that it describes two people.

The threshold this project set for itself is 50 clean responses **per chart**
before a crowd result is shown to anyone. That rule is enforced in the product,
in the API, and in these queries. Right now:

| | |
|---|---|
| Responses recorded | 102 |
| Distinct respondents | **2** |
| Distinct sessions | 6 |
| Questions answered at least once | 89 |
| Charts at the 50-response threshold | **0** |
| Best-covered chart | 2 responses |
| Collection window | 26–30 August 2026 (5 days) |
| Flagged as suspect | 0 |

`analysis/02_divergence.sql` — the file that is meant to produce the headline
divergence ranking — **returns zero rows**. Its `HAVING count(*) >= 5` floor is
not met by a single chart. That is the query working correctly. A divergence
figure computed over two responses is not a finding, it is two people.

### Both respondents are the project's own accounts

The two `user_id`s are the owner's accounts. There is no external traffic in
this data at all: `referrer_host` is `(direct or unknown)` for all 102
responses, and `pct_registered` is 100%. One session originates in the US and
one in Russia, which is the owner's own testing rather than a geographic
finding.

**Nothing in this file describes the public.** It describes two people who
already knew what the site was for.

---

## What the data does support: the instrument works

These are methodological results. They do not need a large sample, because they
are checks on the pipeline rather than claims about belief. They are the
reason to believe the numbers will mean something once real respondents arrive.

### Every stored score is reproducible from the raw path

`analysis/13_integrity_checks.sql` recomputes `mean_abs_error`,
`mean_signed_error` and `score` from `guesses.path` and the dataset's own
series, in SQL, independently of the TypeScript that wrote them.

**All 102 rows match to within 1e-9.** All ten integrity checks return zero
rows.

This matters more than it sounds. The scoring definition exists twice, in two
languages, on opposite sides of a boundary that nothing automatically checks.
This is the check, and it passes. It also means the stored summary columns can
be trusted without re-deriving them, and that a future disagreement will be
caught rather than published.

### People start their line where the data ends

From `analysis/07_shape_of_error.sql`, error by position along the chart, over
all 102 responses (4,080 individual points):

| Position | Mean absolute error |
|---|---|
| 0 (the reveal boundary) | **0.0037** |
| 1 | 0.0111 |
| 5 | 0.0431 |
| 10 | 0.0677 |
| 11 | 0.0727 |

Error at position 0 is essentially zero, then grows monotonically left to
right. That is exactly the expected shape: position 0 is anchored to a value
the player can see, position 39 is a pure prediction.

It is also a second, independent confirmation that the SQL truth
reconstruction is correct. If the resampling were even slightly misaligned,
error at the anchor point would not be near zero.

And it rules out a UI failure mode worth ruling out: a large error at position
0 would mean people were failing to start their line where the known data ends,
which would be a drawing-surface bug rather than a belief.

### Over half of all drawn lines are essentially straight

| Measure | Value |
|---|---|
| Median straightness | 0.986 |
| Mean straightness | 0.774 |
| Lines more than 95% straight | 57 of 102 (**55.9%**) |
| Mean direction reversals per line | 1.62 |

Straightness is the net vertical move divided by the total distance travelled:
1.0 is a perfectly straight line.

This is the most interesting pattern in the current data and the one most
worth re-running at scale. If it holds with real respondents, the claim is not
"people extrapolate the trend" but the stronger and more specific "people
extrapolate the trend **as a straight line**", regardless of what shape the
series was making before the boundary.

**It is two people.** Do not quote it. Re-run
`analysis/07_shape_of_error.sql` section 3 at n > 500 across > 20 respondents
before treating it as anything.

---

## Numbers that exist but should not be quoted

Reported for completeness and because they will be the baseline to compare
against later. Every one of them is two people.

### Overall accuracy

| | |
|---|---|
| Mean absolute error (normalised) | 0.1079 |
| Median absolute error | 0.0848 |
| Mean score | 67.9 |
| Responses within 10% of the axis | 56.9% |

Pooled across all 89 questions, so it is weighted toward whichever charts
happened to get answered, not an estimate of anything general.

### Device

| Device | n | Mean absolute error | Mean score |
|---|---|---|---|
| Desktop | 94 | 0.1049 | 68.7 |
| Mobile | 8 | 0.1425 | 59.3 |

Mobile looks worse. **Do not conclude that.** n=8, one respondent, and
different charts from the desktop set. `analysis/03_divergence_by_segment.sql`
section 6 is the within-question comparison that would actually control for
this, and it has nothing to work with yet.

### Draw time

| Bucket | n | Mean absolute error | Mean score |
|---|---|---|---|
| 0.5 to 1s | 9 | 0.1182 | 65.7 |
| 1 to 2s | 47 | 0.0886 | 72.3 |
| 2 to 4s | 36 | 0.1235 | 64.3 |
| 4 to 8s | 10 | 0.1332 | 62.5 |

Median draw time is 1,807 ms. The apparent sweet spot at 1–2 seconds is
almost certainly noise at this sample size, and `draw_ms` measures only the
final stroke, not thinking time, so it cannot support a "people who think
longer do better" reading either way.

### Redrawing barely happens

99% of responses were first-try. `max_redraws` across the whole dataset is 1.
Either the drawing surface is easy enough that people commit immediately, or
the Redraw button is not discoverable. This data cannot tell those apart, and
that is worth knowing before deciding to redesign anything.

---

## Operational findings, which are real now

These do not need a large sample, because they are facts about the system
rather than claims about people.

### The rotation arithmetic

From `analysis/09_crowd_readiness.sql`:

| | |
|---|---|
| Charts in rotation | 50 |
| Held back | 225 |
| Retired | 310 |
| Responses still needed to finish the rotation | **2,437** |
| Responses needed if nothing were held back | 13,750 |

Narrowing the pool to 50 is what makes the crowd view reachable at all. At 275
charts in rotation it would take roughly 13,750 responses before the average
chart showed a crowd; at 50 it takes about 2,500. Every player currently sees
"you are among the first" and never the payoff, and that stays true until a
chart crosses 50.

### Zero flagged responses, which is not reassuring

`pct_flagged` is 0.0% across all 102 rows. With only the owner playing, that is
the expected result and tells us nothing about whether detection works.

The number to watch after any traffic spike is the flag rate in
`analysis/08_data_quality.sql` section 4. A rate near zero once real traffic
arrives is suspicious in the *other* direction: it would more likely mean
detection is failing than that every visitor is sincere.

### Data left over from earlier testing

Two artefacts worth knowing about before reading anything above:

- **16 retired charts still hold responses.** Some carry a `mean_signed_error`
  as large as −0.31. These are questions nobody can be served any more, so
  their data will never grow.
- **`order_in_session` has permanent holes.** One session has 28 rows spanning
  positions 1 to 33, because deleted test rows leave gaps that are never
  renumbered. This broke the funnel query the first time it ran — it reported
  150% continuation at step 11, and a funnel that rises is always a bug.
  Fixed by recomputing the step with `row_number()`.

---

## What needs to be true before any of this is publishable

In order:

1. **50 clean responses on at least one chart.** Nothing is quotable before
   this. It is the threshold the product itself enforces.
2. **Respondents who are not the owner.** All 102 current responses come from
   2 accounts that already knew the answers were being measured. This is the
   single largest problem with the current data and no amount of volume from
   the same two people fixes it.
3. **Remove or clearly separate the pre-launch data.** These 102 responses are
   testing artefacts. They should not be pooled with real collection, and the
   collection window should start from the first genuine external respondent.
4. **A real `topic` column on `datasets`.** `analysis/05_directional_bias.sql`
   section 3 groups by a hand-written keyword heuristic over the slug because
   nothing better exists. It will misfile charts. Section 4 audits it, but the
   right fix is a column.
5. **Re-read the caveats in each SQL file.** Every segment comparison in
   `03_divergence_by_segment.sql` is confounded by which questions each segment
   answered, because chart order is randomised per user. Section 6 shows the
   within-question form that controls for it; the raw cuts are the ones that
   produce wrong headlines.

---

## How to reproduce this document

```bash
psql "$DATABASE_URL" -f analysis/01_response_summary.sql
```

Run `01` first, every time, and read the sample size before reading anything
else. See [`analysis/README.md`](analysis/README.md) for what each file
answers, and [`SCHEMA.md`](SCHEMA.md) for what the columns mean.

`analysis/13_integrity_checks.sql` should return **zero rows from every
statement**. If it does not, stop and fix that before reading any other
result — a mismatch there means a published number would be wrong.
