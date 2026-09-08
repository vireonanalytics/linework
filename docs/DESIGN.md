# Design and architecture notes

The durable rules behind Linework: the ones a change could break silently, and
the reasoning that makes them worth keeping. Referenced from comments
throughout the codebase.

---

## The one-sentence version

Users see the first portion of a real time-series chart, drag to draw where
they think it goes next, then watch the truth reveal over their guess. Every
drawn path is stored. **The game is the collection instrument; the aggregated
misperception data is the output.**

That framing decides most of the arguments below. When engagement and data
integrity conflict, integrity wins, because a fun game built on a corrupted
dataset has produced nothing.

---

## Colour is a contract, not decoration

Every colour flows through a CSS custom property in `app/tokens.css`. **There
is never a literal hex in a component.**

Two properties carry meaning rather than appearance:

| Token | Means |
|---|---|
| `--ink-crowd` | What people drew |
| `--ink-truth` | What actually happened. Real data, and nothing else |

This is load-bearing. `Chart`, `InkPaths`, `useDrawingSurface` and both
sparkline components were written to read those two properties and have never
been edited since. The project has been through three complete visual
directions and each one changed values in `tokens.css` while touching no
component. If a future direction needs a component edited to change a colour,
something has gone wrong.

**A marketing page is where this rule gets quietly broken**, because the truth
ink is usually the most attention-grabbing colour in the palette. It has held
so far: where the homepage uses the truth ink at display scale, it is marking
something that genuinely refers to a true value.

### Enforcement

`scripts/check-design.sh` fails the build on forbidden idioms, on any
`font-family` that does not resolve through a `--font-*` token, and on colours
that are not tokens. It runs as part of `npm run check`.

Two contexts are exempt and both are named in the script itself: the OG image
route and the email templates. Neither has a CSS cascade to inherit tokens
from. Satori has no stylesheet, and mail clients strip `<style>` blocks and
render Outlook through Word, so custom properties cannot reach either one.

---

## The chart SVG has no `viewBox`, deliberately

It is sized by CSS, so one user unit is one CSS pixel and pointer coordinates
need no scaling.

**Adding a `viewBox` would silently break every coordinate conversion in the
drawing surface.** Not loudly, which is the problem: strokes would still
record, at the wrong values.

Related: `useDrawingSurface` maps pointer coordinates through
`getBoundingClientRect()`, which reflects CSS transforms. Anything that
animates a transform on a chart must disable pointer events for the duration,
or a stroke drawn mid-animation is recorded at coordinates that were never on
screen.

---

## Module boundaries

| Module | Rule |
|---|---|
| `lib/drawing/resample.ts`, `lib/scoring/score.ts`, `lib/chart/geometry.ts` | Pure. No React, no DOM |
| `components/useDrawingSurface.ts` | Every pointer event, no rendering |
| `components/Chart.tsx` | Renders, holds no state |
| `components/DrawTheLine.tsx` | The only place the state machine lives |

**Imports.** `lib/` is runnable by plain Node, since the validator and the
tests import it directly, so everything inside `lib/` uses relative imports
with explicit `.ts` extensions. `app/` and `components/` never run outside
Next, so they use the `@/` alias.

A missing extension inside `lib/` still passes `next build`, because the
bundler resolves it. Plain Node does not. That failure only surfaces when a
script runs.

**Client and server boundaries.** A client component must never transitively
import anything under `lib/server/`. Pure logic both sides need lives outside
that directory. Pulling in the database module from a form component drags the
entire Postgres driver into the browser bundle and fails the build on `net` /
`tls` / `fs`.

---

## Scoring

Guess and truth are normalised to 0..1 across the chart's `yDomain`, then
compared across 40 resampled points:

```
meanAbsError    = mean(|guess - truth|)
meanSignedError = mean(guess - truth)      // positive = drew too high
score           = round(100 * exp(-4 * meanAbsError))
```

Two details that are easy to lose:

1. **The truth is resampled onto the same 40 x positions as the guess** before
   any error maths. The series has one point per year; a guess always has 40
   points. Without resampling the two arrays are not comparable.
2. **Scoring runs on the quantised path**, the integers actually stored, not on
   raw float units, so a score recomputed from the database always matches the
   one the player saw.

`mean_signed_error` is the column the research output is built on. Absolute
error says people are wrong; signed error says which direction, and a
direction that holds across many people is a claim about public belief.

**The score is never trusted from the client.** The request payload parses into
a type that structurally has no score field, and the server scores against its
own database read of the series. The client computes the same score locally so
the reveal animation never waits on the network, and the server's answer
silently replaces it if they differ.

---

## Data integrity

**Unverified data must never reach production**, enforced at three independent
layers:

1. `scripts/validate-datasets.ts` fails the build if any active dataset is
   unverified, is missing a source URL, or has mismatched series lengths.
2. Serving routes gate on `is_active`.
3. A database `CHECK` constraint makes `is_active = true` with
   `verified = false` impossible for any writer, buggy application code
   included.

Application code can be bypassed or wrong. A constraint cannot. See
[`SCHEMA.md`](../SCHEMA.md) for the full set.

**`verified` and `reliability` are separate axes, deliberately.** `verified`
means a human checked it. `reliability` describes where the numbers came from:
green means the source's own published values, fetched reproducibly from a
named series id; red means approximated or unconfirmed. An automated import can
legitimately be green while unverified, and collapsing the two would let a
script mark its own output human-approved.

**Questions must never reveal their own answer.** An early draft of the
imported catalogue framed charts with editorial hooks like "one of the
countries that improved fastest". Every one of those hands the player the
answer before they draw.

This is a uniquely nasty bug class here because it has **no visible symptom**:
the chart renders, the guess records, the aggregate computes, and the dataset
silently stops measuring belief and starts measuring reading comprehension.
Nothing downstream can tell the two apart afterwards. Question text describes
only what is measured; a unit test enforces it.

---

## Crowd cold start

Percentile bands never render below **50 clean responses for that chart**
(`CROWD_MIN_N` in `lib/crowd/constants.ts`). Below the threshold the API
response is shaped with no percentiles and no sample present at all, so no
client bug can render bands that should not exist.

Never present noise as consensus.

---

## Data quality at write time

Responses are flagged on insert when the path has zero variance, the draw took
under 300ms, the session already answered that chart, or the user agent matches
a known automation signature.

Reasons **accumulate** rather than short-circuit, so a row guilty of three is
recorded as guilty of three. A flag with no stated reason can never be audited
later. Flagged rows are stored and excluded from every published aggregate;
they are never deleted.

Separately, low-effort detection judges **the shape of a line only, never its
accuracy**. Being wrong is the entire point of this dataset, and a confidently
wrong line is the most valuable row in the table. Penalising wrongness would
destroy the signal and teach people to draw what they think is expected.

---

## Privacy

Two pipelines, kept genuinely separate:

- **Anonymous play** stores no raw IP, no raw user agent, and nothing
  identifying. The user agent is hashed with a server-only pepper that never
  reaches the database; a missing or short pepper is a hard throw, not a
  warning, because a silent fallback is how a no-PII promise quietly stops
  being true. Country is a two-letter code, never a coordinate. Referrer is a
  hostname with the path and query string stripped.
- **Accounts** hold real, disclosed personal data, because an account cannot
  exist without something identifying.

`guesses.session_id` is always present and always anonymous. `guesses.user_id`
is additional and nullable, never a replacement.

**Exports carry no email, no display name, no user id and no session id**, and
the identifiers are dropped in the query rather than filtered afterwards. An
export is the easiest place for that promise to break.

---

## Testing

`node:test` and `node:assert` through Node's native TypeScript type-stripping.
No test framework, no test dependencies. Tests live beside what they test as
`*.test.ts` inside `lib/`.

React components have no unit tests by design. The pointer behaviour is
verified in a real browser and against the device checklist in
[`../TESTING.md`](../TESTING.md), because that is the only place it can
actually fail.

Mobile input was defended against up front: pointer capture on `pointerdown`,
non-primary pointers ignored for palm rejection, `pointercancel` treated the
same as `pointerup` because iOS fires it on interruption, and chart geometry
recomputed on resize and orientation change. **Never cache a bounding rect
across those.**

---

## A note on dates and the database

Postgres `date` columns hydrate as JS `Date` objects. `String(aDate)` yields
`"Thu Aug 27 2026 ..."` in the server's local timezone, so slicing the first
ten characters gives `"Thu Aug 27"`, never an ISO date.

Use the shared `toDateOnly()` / `toIso()` helpers in `lib/server/db.ts`. This
has been the root cause of more than one bug here, including a streak counter
that silently reset on every play while its own pure logic remained correct and
fully tested. A well-tested pure function proves nothing about the code
assembling its inputs.
