#!/usr/bin/env bash
#
# Design drift guard.
#
# The design direction is riso two-ink: flat colour, hard edges, one accent.
# The things below are the house style of generic AI-generated interfaces, and
# every one of them would quietly undo that direction. This script is the
# thing that notices.
#
# Must pass before Phase 2 is called done. Run with: npm run check:design
#
# Only app/, components/ and lib/ are scanned. This script and the docs are
# allowed to name the forbidden things in order to forbid them.

set -uo pipefail
cd "$(dirname "$0")/.."

SCAN_DIRS=(app components lib)
STATUS=0

report() {
  STATUS=1
  echo ""
  echo "  FAIL  $1"
  shift
  printf '%s\n' "$@" | sed 's/^/        /'
}

# --- forbidden visual idioms ----------------------------------------------

# box-shadow is NOT here any more. The current design direction is built on
# hard offset shadows (0 blur, 0 spread) - see .card--offset-* in globals.css -
# so banning the property outright would ban the house style. The soft,
# blurred Tailwind shadows are still out, which is what the rule was always
# actually aiming at.
FORBIDDEN_PATTERNS=(
  'gradient'
  'backdrop-blur'
  'backdrop-filter'
  'rounded-2xl'
  'rounded-3xl'
  'shadow-lg'
  'shadow-xl'
  'shadow-md'
)

for pattern in "${FORBIDDEN_PATTERNS[@]}"; do
  hits=$(grep -rIn --fixed-strings "$pattern" "${SCAN_DIRS[@]}" 2>/dev/null || true)
  if [ -n "$hits" ]; then
    report "forbidden idiom: $pattern" "$hits"
  fi
done

# --- forbidden colours -----------------------------------------------------
# Cream and terracotta. Not a matter of taste - they are the default palette of
# machine-made design, and this project is trying not to look like that.

# --- forbidden colours -----------------------------------------------------
#
# RETIRED 2026-08-27, by explicit instruction ("absolutely forget about the
# blocked designs"). The cream-and-terracotta ban came from the original riso
# brief; the current design is built ON a warm off-white ground taken from the
# human's own mock, so the rule now contradicts the design it is supposed to
# protect. The hue-band maths that enforced it is gone with it rather than
# left commented out - a disabled guard that looks enabled is worse than none.

# --- fonts must come from a token ------------------------------------------
# Fonts are loaded by next/font in app/layout.tsx now, which self-hosts them
# at build time and exposes each as a CSS variable; app/tokens.css turns those
# into the --font-* tokens. Everywhere else, a font-family declaration still
# has to resolve through one of those tokens.

# "inherit" is a CSS keyword, not a literal font name - it explicitly defers
# to whatever ancestor already resolved through a token, so it is exempt for
# the same reason var(--font-*) is.
# lib/email/templates.ts is exempt for the same reason as the colour check
# above: mail clients cannot read a stylesheet, so an email must name its
# families inline or arrive in whatever default serif the client picks.
font_hits=$(grep -rIn "font-family" "${SCAN_DIRS[@]}" 2>/dev/null \
  | grep -v "^app/tokens.css:" \
  | grep -v "^lib/email/templates.ts:" \
  | grep -v "var(--font" | grep -v "font-family: *inherit" || true)

if [ -n "$font_hits" ]; then
  report "font-family not resolved through a token" "$font_hits" \
    "Type is part of the design system. Name families in app/tokens.css only."
fi

# --- emoji -----------------------------------------------------------------
# BSD grep has no unicode property classes, so this part runs in node.

emoji_hits=$(node --input-type=module -e '
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{2460}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u;
const hits = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) { walk(path); continue; }
    if (!/\.(tsx?|css|jsx?)$/.test(entry)) continue;
    readFileSync(path, "utf8").split("\n").forEach((line, i) => {
      if (EMOJI.test(line)) hits.push(`${path}:${i + 1}:${line.trim()}`);
    });
  }
}

for (const dir of ["app", "components", "lib"]) walk(dir);
process.stdout.write(hits.join("\n"));
')

if [ -n "$emoji_hits" ]; then
  report "emoji found" "$emoji_hits"
fi

# --- every colour must come from a token -----------------------------------
# tokens.css is the one file allowed to hold a literal colour. Anywhere else,
# a literal means Phase 2 cannot re-skin the project by editing one file.

color_hits=$(node --input-type=module -e '
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const LITERAL = /(#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|color-mix)\s*\()/;
// app/api/og/route.tsx renders via Satori (next/og), a separate server-side
// engine with no CSS cascade - it cannot read tokens.css custom properties,
// so docs/DESIGN.md names OG images as one of the contexts this rule cannot
// reach. That file documents the exception inline; this is the enforcement
// side of the same decision.
// lib/email/templates.ts is the same class of exception for the same
// reason: an email is rendered by a mail client, which never loads the
// stylesheet for this site, strips <style> blocks, and in Outlook renders
// through Word. Custom properties cannot reach it, so colour and type must
// be inline literals or the mail arrives unstyled. docs/DESIGN.md already names
// "OG images, static exports" as contexts this rule cannot reach;
// transactional email is a third, and that file says so at its own top.
const ALLOWED = new Set([
  "app/tokens.css",
  "app/api/og/route.tsx",
  "lib/email/templates.ts",
]);
const hits = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) { walk(path); continue; }
    if (!/\.(tsx?|css|jsx?)$/.test(entry)) continue;
    if (ALLOWED.has(path)) continue;
    readFileSync(path, "utf8").split("\n").forEach((line, i) => {
      if (LITERAL.test(line)) hits.push(`${path}:${i + 1}:${line.trim()}`);
    });
  }
}

for (const dir of ["app", "components", "lib"]) walk(dir);
process.stdout.write(hits.join("\n"));
')

if [ -n "$color_hits" ]; then
  report "literal colour outside app/tokens.css" "$color_hits" \
    "Every colour must resolve to a custom property defined in app/tokens.css."
fi

# --- report ----------------------------------------------------------------

if [ "$STATUS" -ne 0 ]; then
  echo ""
  echo "check-design: failed"
  exit 1
fi

echo "check-design: clean"
