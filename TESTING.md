# Testing

Automated checks catch the things a machine can see. The drawing mechanic is
not one of them: the only real test is a thumb on a phone.

## Automated

```bash
npm run check
```

Runs, in order: dataset validation, design drift guard, ESLint, `tsc --noEmit`.
`npm run build` runs dataset validation on its own before compiling, so
unverified data cannot reach production even if nobody ran `check`.

`npm test` covers everything server-side that doesn't need a live database:
suspect flagging, UA hashing (including that a missing pepper throws, and that
rotating it severs old hashes), rate-limit bucket math, and request payload
validation (including that a client-submitted score is structurally dropped,
never just ignored at runtime).

## Phase 3: proving a guess reaches the database

None of the above touches Postgres. This does. Needs `.env.local` filled in
per `.env.example` and the migration pushed (`npm run db:push`) and seeded
(`npm run seed`) — see `README.md` for exact steps if that
hasn't happened yet.

1. `npm run dev:lan`, open on a real phone (see below).
2. Draw a guess, reveal it. The result panel shows a live status line —
   "Recording..." then "Recorded as guess #N."
3. In the Supabase table editor, open `guesses`, find that row, and check:
   - `path` has exactly 40 elements, each `0..1000`.
   - `path_resolution` is `40`.
   - `score`, `mean_abs_error`, `mean_signed_error` match what the browser's
     network tab shows in the `/api/guess` response — not what the client
     computed locally before the request went out. If the reveal briefly
     showed one score and it changed slightly after, that's the local number
     being replaced by the server's; a mismatch is also logged to the console
     as a warning.
   - `is_suspect` and `suspect_reasons` are what you'd expect. Draw a second
     guess on the same dataset in the same session (don't clear cookies) and
     confirm it comes back with `suspect_reasons` containing
     `duplicate-in-session`.
   - `sessions.ua_hash` is a short opaque string, **not** your actual user
     agent. `sessions.country` is a two-letter code or null, never a
     coordinate.
4. Draw a flat line (barely move) and reveal fast — check `zero-variance`
   and/or `too-fast` land in `suspect_reasons`.
5. Confirm rate limiting: fire 31 guesses inside a minute (a quick loop
   against `/api/guess` with `curl` is fine for this one) and check the 31st
   comes back `429` with a `Retry-After` header.

## Testing on a real phone

The dev server binds to localhost by default, which a phone cannot reach.

```bash
npm run dev:lan
```

Then find the Mac's LAN address and open `http://<address>:3000` on a phone
joined to the same wifi:

```bash
ipconfig getifaddr en0
```

## Manual checklist

Run all of it on a real iOS Safari and a real Android Chrome. The simulator
does not reproduce most of these, because most of them are about how the OS
competes with the page for the gesture.

### Core

- [ ] Finger drag across the shaded region draws a line, and **the page does not
      scroll** while drawing. This is the one that matters most.
- [ ] No text gets selected, and no magnifier or copy/paste bubble appears
      during or after a drag.
- [ ] The stroke never drops out mid-drag or jumps to a stale position.
- [ ] Mouse drawing works on desktop, same code path.
- [ ] Drawing right to left does nothing backwards; the line only ever advances.
- [ ] A stroke that stops halfway shows "Draw all the way to the end." and
      leaves Reveal disabled.
- [ ] Reveal animates the pink truth line left to right as one motion, then the
      score appears.
- [ ] Redraw clears the guess and re-enables drawing.

### Where touch actually breaks

- [ ] **Draw starting outside the region.** Start the drag to the left of the
      boundary, or above/below the plot, and drag in. The stroke should clamp to
      the drawable region rather than being ignored or starting off-chart.
- [ ] **Rotation mid-draw.** Start a stroke, rotate the phone without lifting
      the finger, keep drawing. The line must not offset from the finger. This
      is the cached-bounding-rect bug; geometry is rebuilt on
      `orientationchange` specifically to prevent it.
- [ ] **Rotate after drawing, before revealing.** The guess must stay pinned to
      the same data values, not the same pixels.
- [ ] **Two-finger pinch during a draw.** The second finger is non-primary and
      must be ignored. The stroke should continue tracking the first finger, or
      cleanly end, but never jump between fingers.
- [ ] **Drawing near the bottom edge**, where iOS Safari's toolbar lives. Drag
      along the very bottom of the plot. The toolbar may appear or the page may
      try to trigger the home gesture; the stroke must not be lost.
- [ ] **Palm contact.** Rest the side of a hand on the screen while drawing with
      a finger.
- [ ] **Interruption.** Start a stroke and pull down the notification shade, or
      take a call. iOS fires `pointercancel`; the stroke should end cleanly, not
      hang in a drawing state that blocks the next attempt.
- [ ] **Fast flick.** Draw as fast as possible across the region. Resampling
      must still produce 40 points and the line must still land on the values
      drawn.
- [ ] **Very slow draw.** Same, with hundreds of raw points.
- [ ] **Pinch-zoom the page, then draw.** Zoom is deliberately left enabled.
      With the page zoomed, the stroke must still follow the finger.

### Scoring sanity

- [ ] Trace the real line as closely as possible after revealing once: score
      near 100.
- [ ] Draw a flat horizontal line from the boundary: low score, and mean signed
      error clearly positive (the real series falls, so a flat guess is too
      high).
- [ ] Draw far above the truth: signed error positive. Far below: negative.

## Design preview

`http://localhost:3000/?preview=crowd` renders 400 **fabricated** paths at
reveal, to check the ink-density blending. Never real data — see
`lib/crowd/synthetic.ts`.

- [ ] The synthetic-data notice is on screen whenever those paths are.
- [ ] Without the flag, no crowd paths render at all.
- [ ] Dense agreement stacks visibly darker than the sparse tails.
- [ ] Your own line stays legible against the crowd.
- [ ] The pink truth line stays fluorescent, not muddied, where it crosses.

## Console output

Until Phase 3 there is no API. On reveal, the captured payload is logged:

```
[draw-the-line] guess { datasetSlug, path, pathResolution, drawMs,
                        redrawCount, viewportWidth, score,
                        meanAbsError, meanSignedError }
```

- [ ] `path` is exactly 40 integers, each between 0 and 1000.
- [ ] `drawMs` is plausible for how long the stroke took.
- [ ] `redrawCount` increments on Redraw, and also when a finished guess is
      drawn over.
