import type { Dataset } from "../types/dataset.ts";

/**
 * TODO: verify against NCHS.
 *
 * These values approximate the real NCHS curve: the correct shape, the correct
 * endpoints (61.8 in 1991, 13.2 in 2023), and the real 2006-2007 uptick that
 * interrupts the decline. Individual mid-series values are NOT precise and must
 * not be quoted. A human is pulling the exact series from CDC WONDER; until
 * then verified stays false and isActive stays false, which keeps this file out
 * of any production build (see scripts/validate-datasets.ts).
 */
export const teenBirthRate: Dataset = {
  slug: "us-teen-birth-rate",
  title: "US teen birth rate, 1991-2023",
  question: "Births per 1,000 women aged 15-19. Draw what happened after 2007.",
  yLabel: "Births per 1,000 women aged 15-19",
  yUnit: "per 1,000",
  xValues: [
    "1991", "1992", "1993", "1994", "1995", "1996", "1997", "1998", "1999",
    "2000", "2001", "2002", "2003", "2004", "2005", "2006", "2007", "2008",
    "2009", "2010", "2011", "2012", "2013", "2014", "2015", "2016", "2017",
    "2018", "2019", "2020", "2021", "2022", "2023",
  ],
  yValues: [
    61.8, 60.3, 59.0, 58.2, 56.0, 53.5, 51.3, 50.3, 48.8,
    47.7, 44.8, 42.9, 41.1, 40.5, 39.7, 41.1, 41.5, 40.2,
    37.9, 34.2, 31.3, 29.4, 26.5, 24.2, 22.3, 20.3, 18.8,
    17.4, 16.7, 15.4, 13.9, 13.6, 13.2,
  ],
  // Index 16 is 2007: the local peak. Everything the player has to predict is
  // the halving that follows, which is the part almost nobody knows about.
  revealFromIndex: 16,
  yDomain: [0, 70],
  sourceName: "CDC / National Center for Health Statistics",
  sourceUrl: "https://wonder.cdc.gov/natality.html",
  verified: false,
  verifiedOn: null,
  isActive: false,
  // Rated red because the values between the anchor points were produced
  // by a straight line, not measured by anyone. See the reliability note
  // in supabase/migrations/20260827160000_reliability.sql.
  reliability: "red",
  reliabilityNote:
    "Values are piecewise-linear interpolations between a small number of real, sourced anchor points (see lib/datasets/interpolate.ts), not the source's own annual series. Re-import exact values before publishing "
    + "anything from this chart.",
};
