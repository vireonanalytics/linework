/**
 * The curated catalogue of World Bank indicators to import.
 *
 * WHY THE WORLD BANK. The human asked for charts from "government, UN, any
 * other respected and well-known organisations". The World Bank's World
 * Development Indicators is exactly that, and it has one property that
 * matters more than prestige here: it serves EXACT ANNUAL VALUES over a free,
 * keyless API. Every other candidate either needs a key, ships PDFs, or would
 * have to be transcribed by hand - and hand-transcription is how the original
 * 21 charts ended up as interpolated approximations rated red.
 *
 * The WDI is also mostly a REDISTRIBUTOR of primary sources: life expectancy
 * comes from the UN Population Division, immunisation from WHO/UNICEF,
 * homicide from UNODC, emissions from national inventories, labour from the
 * ILO, schooling from the UNESCO Institute for Statistics. The importer
 * records each indicator's `sourceOrganization` so the real origin travels
 * with the data rather than everything being credited to "World Bank".
 *
 * ---------------------------------------------------------------------------
 * THE REWRITE OF 2026-08-27, AND THE MISTAKE IT CORRECTS
 * ---------------------------------------------------------------------------
 * The first version of this file had 43 indicators crossed with country lists
 * of a dozen or more each, which produced 331 charts. The human's verdict is
 * worth recording verbatim, because it was right: "There are too many charts
 * that are practically the same - child mortality rate in country A, in
 * country B, etc. Just adding a different country is not a differentiation."
 *
 * That was a failure of the curation principle below, not of the importer.
 * Asking an American to draw child mortality in Vietnam and then again in
 * Ethiopia is ONE question asked twice. It collects one belief sampled twice,
 * at the cost of two slots in a player's queue - and this project's whole
 * purpose is breadth of BELIEF, not breadth of geography.
 *
 * So the axis of breadth is now the QUESTION:
 *
 *   1. Breadth comes from distinct indicators. This file draws on ~150 of the
 *      659 WDI series that have gap-free US or World coverage, up from 43.
 *   2. Country lists are tiny - almost always US, WORLD, or US_AND_WORLD.
 *      The US and the world are genuinely DIFFERENT questions about the same
 *      quantity: "has American life expectancy risen?" and "has the world's?"
 *      have different answers and attract different wrong beliefs. That
 *      pairing earns its place where the country-spam did not.
 *   3. A named third country appears only in the final section, where the
 *      COUNTRY ITSELF is the question - Russia's life-expectancy collapse,
 *      Japan's shrinking population, France's nuclear share. A deliberate
 *      minority, and each one carries its own framing in the question text.
 *
 * CURATION PRINCIPLE (unchanged, applied far more strictly). An indicator
 * earns a place here only if a reasonable person could hold a WRONG belief
 * about its shape. A series everyone already knows collects no misperception;
 * a series nobody has any prior about at all collects noise. That rules out
 * both "population of the United States" (known) and "net acquisition of
 * financial assets as a share of GDP" (no prior).
 */

export type IndicatorSpec = {
  /** World Bank indicator code. Also stored as source_series_id, which is what makes the import reproducible. */
  code: string;
  /** Stable slug stem; the country code gets appended, which is what keeps stems reusable across countries. */
  slug: string;
  /** `{country}` is substituted. */
  title: string;
  /** `{country}` and `{year}` are substituted. {year} is the reveal boundary. */
  question: string;
  yLabel: string;
  yUnit: string;
  /** ISO3 codes, or WLD for the world aggregate. */
  countries: string[];
  /** Ignore observations before this year - avoids sparse early tails. */
  minYear?: number;
  /** Decimal places to round to. Keeps stored values tidy without inventing precision. */
  decimals?: number;
};

/**
 * The only three country lists the main body of this file should use.
 * Anything else needs a reason written beside it, because "add another
 * country" is the exact move that produced 331 near-duplicate charts.
 */
const US = ["USA"];
const WORLD = ["WLD"];
const US_AND_WORLD = ["USA", "WLD"];

export const CATALOGUE: IndicatorSpec[] = [
  // =========================================================================
  // LIFE AND DEATH
  // =========================================================================
  {
    code: "SP.DYN.LE00.IN",
    slug: "life-expectancy",
    title: "Life expectancy at birth in {country}",
    question: "Years a newborn could expect to live. Draw what happened after {year}.",
    yLabel: "Years",
    yUnit: "years",
    countries: US_AND_WORLD,
    minYear: 1960,
    decimals: 1,
  },
  {
    code: "SP.DYN.LE00.MA.IN",
    slug: "life-expectancy-men",
    title: "Life expectancy for men in {country}",
    question: "Years a newborn boy could expect to live. Draw what happened after {year}.",
    yLabel: "Years",
    yUnit: "years",
    countries: US,
    minYear: 1960,
    decimals: 1,
  },
  {
    code: "SP.DYN.LE00.FE.IN",
    slug: "life-expectancy-women",
    title: "Life expectancy for women in {country}",
    question: "Years a newborn girl could expect to live. Draw what happened after {year}.",
    yLabel: "Years",
    yUnit: "years",
    countries: US,
    minYear: 1960,
    decimals: 1,
  },
  {
    code: "SP.DYN.AMRT.MA",
    slug: "adult-male-mortality",
    title: "Adult male death rate in {country}",
    question:
      "Deaths per 1,000 men who reach 15, before they reach 60. Draw what happened after {year}.",
    yLabel: "Deaths per 1,000 adult men",
    yUnit: "per 1,000",
    countries: US_AND_WORLD,
    minYear: 1960,
    decimals: 1,
  },
  {
    code: "SP.DYN.TO65.MA.ZS",
    slug: "survival-to-65-men",
    title: "Share of men surviving to age 65 in {country}",
    question:
      "Percent of newborn boys who would reach 65 at current death rates. Draw what happened after {year}.",
    yLabel: "% of cohort",
    yUnit: "%",
    countries: US,
    minYear: 1960,
    decimals: 1,
  },
  {
    code: "SH.DYN.MORT",
    slug: "under-five-mortality",
    title: "Child deaths before age five in {country}",
    question:
      "Deaths before age five, per 1,000 live births. Draw what happened after {year}.",
    yLabel: "Deaths per 1,000 live births",
    yUnit: "per 1,000",
    countries: US_AND_WORLD,
    minYear: 1960,
    decimals: 1,
  },
  {
    code: "SP.DYN.IMRT.IN",
    slug: "infant-mortality",
    title: "Infant deaths in the first year of life in {country}",
    question: "Deaths before age one, per 1,000 live births. Draw what happened after {year}.",
    yLabel: "Deaths per 1,000 live births",
    yUnit: "per 1,000",
    countries: US_AND_WORLD,
    minYear: 1960,
    decimals: 1,
  },
  {
    code: "SH.DYN.NMRT",
    slug: "neonatal-mortality",
    title: "Newborn deaths in the first month of life in {country}",
    question: "Deaths in the first 28 days, per 1,000 live births. Draw what happened after {year}.",
    yLabel: "Deaths per 1,000 live births",
    yUnit: "per 1,000",
    countries: US_AND_WORLD,
    decimals: 1,
  },
  {
    code: "SH.STA.MMRT",
    slug: "maternal-mortality",
    title: "Deaths of mothers in childbirth in {country}",
    question: "Maternal deaths per 100,000 live births. Draw what happened after {year}.",
    yLabel: "Deaths per 100,000 live births",
    yUnit: "per 100,000",
    countries: US_AND_WORLD,
    decimals: 0,
  },
  {
    code: "SH.MMR.RISK.ZS",
    slug: "lifetime-maternal-death-risk",
    title: "Lifetime risk of dying from childbirth in {country}",
    question:
      "Percent chance a 15-year-old girl eventually dies of a maternal cause. Draw what happened after {year}.",
    yLabel: "% lifetime risk",
    yUnit: "%",
    countries: WORLD,
    decimals: 2,
  },
  {
    code: "SH.DYN.1519",
    slug: "teen-death-rate",
    title: "Death rate among teenagers aged 15-19 in {country}",
    question: "Deaths per 1,000 teenagers aged 15-19. Draw what happened after {year}.",
    yLabel: "Deaths per 1,000",
    yUnit: "per 1,000",
    countries: US_AND_WORLD,
    decimals: 2,
  },
  {
    code: "SH.DYN.2024",
    slug: "young-adult-death-rate",
    title: "Death rate among young adults aged 20-24 in {country}",
    question: "Deaths per 1,000 young adults aged 20-24. Draw what happened after {year}.",
    yLabel: "Deaths per 1,000",
    yUnit: "per 1,000",
    countries: US,
    decimals: 2,
  },
  {
    code: "SH.DYN.0509",
    slug: "child-death-rate-5-9",
    title: "Death rate among children aged 5-9 in {country}",
    question: "Deaths per 1,000 children aged 5-9. Draw what happened after {year}.",
    yLabel: "Deaths per 1,000",
    yUnit: "per 1,000",
    countries: WORLD,
    decimals: 2,
  },
  {
    code: "SH.STA.SUIC.P5",
    slug: "suicide-rate",
    title: "Suicide rate in {country}",
    question: "Deaths by suicide per 100,000 people. Draw what happened after {year}.",
    yLabel: "Deaths per 100,000",
    yUnit: "per 100,000",
    countries: US_AND_WORLD,
    decimals: 1,
  },
  {
    code: "SH.STA.SUIC.MA.P5",
    slug: "male-suicide-rate",
    title: "Suicide rate among men in {country}",
    question: "Deaths by suicide per 100,000 men. Draw what happened after {year}.",
    yLabel: "Deaths per 100,000 men",
    yUnit: "per 100,000",
    countries: US,
    decimals: 1,
  },
  {
    code: "SH.STA.POIS.P5",
    slug: "poisoning-death-rate",
    title: "Deaths from unintentional poisoning in {country}",
    question:
      "Deaths per 100,000 people from unintentional poisoning, which includes drug overdoses. Draw what happened after {year}.",
    yLabel: "Deaths per 100,000",
    yUnit: "per 100,000",
    countries: US_AND_WORLD,
    decimals: 2,
  },
  {
    code: "SH.STA.TRAF.P5",
    slug: "road-death-rate",
    title: "Deaths on the road in {country}",
    question: "Road traffic deaths per 100,000 people. Draw what happened after {year}.",
    yLabel: "Deaths per 100,000",
    yUnit: "per 100,000",
    countries: US_AND_WORLD,
    decimals: 1,
  },
  {
    code: "VC.IHR.PSRC.MA.P5",
    slug: "male-homicide-rate",
    title: "Men murdered in {country}",
    question: "Homicide deaths per 100,000 men. Draw what happened after {year}.",
    yLabel: "Homicides per 100,000 men",
    yUnit: "per 100,000",
    countries: US,
    decimals: 1,
  },
  {
    code: "VC.IHR.PSRC.FE.P5",
    slug: "female-homicide-rate",
    title: "Women murdered in {country}",
    question: "Homicide deaths per 100,000 women. Draw what happened after {year}.",
    yLabel: "Homicides per 100,000 women",
    yUnit: "per 100,000",
    countries: US,
    decimals: 2,
  },
  {
    code: "VC.IHR.PSRC.P5",
    slug: "homicide-rate",
    title: "Murder rate in {country}",
    question: "Homicide deaths per 100,000 people. Draw what happened after {year}.",
    yLabel: "Homicides per 100,000",
    yUnit: "per 100,000",
    countries: WORLD,
    decimals: 1,
  },
  {
    code: "SH.DYN.NCOM.ZS",
    slug: "chronic-disease-death-risk",
    title: "Risk of dying early from chronic disease in {country}",
    question:
      "Percent chance a 30-year-old dies of heart disease, cancer, diabetes or lung disease before 70. Draw what happened after {year}.",
    yLabel: "% risk between ages 30 and 70",
    yUnit: "%",
    countries: US_AND_WORLD,
    decimals: 1,
  },
  {
    code: "SP.DYN.CDRT.IN",
    slug: "crude-death-rate",
    title: "Deaths per 1,000 people in {country}",
    question: "Total deaths in a year per 1,000 people. Draw what happened after {year}.",
    yLabel: "Deaths per 1,000 people",
    yUnit: "per 1,000",
    countries: US_AND_WORLD,
    minYear: 1960,
    decimals: 1,
  },

  // =========================================================================
  // DISEASE
  // =========================================================================
  {
    code: "SH.TBS.INCD",
    slug: "tuberculosis-rate",
    title: "New tuberculosis cases in {country}",
    question: "New TB cases per 100,000 people. Draw what happened after {year}.",
    yLabel: "Cases per 100,000",
    yUnit: "per 100,000",
    countries: US_AND_WORLD,
    decimals: 1,
  },
  {
    code: "SH.HIV.INCD.ZS",
    slug: "hiv-infection-rate",
    title: "New HIV infections in {country}",
    question:
      "New HIV infections per 1,000 uninfected adults aged 15-49. Draw what happened after {year}.",
    yLabel: "New infections per 1,000",
    yUnit: "per 1,000",
    countries: WORLD,
    decimals: 2,
  },
  {
    code: "SH.HIV.ARTC.ZS",
    slug: "hiv-treatment-coverage",
    title: "Share of people with HIV receiving treatment in {country}",
    question:
      "Percent of people living with HIV who are on antiretroviral therapy. Draw what happened after {year}.",
    yLabel: "% receiving treatment",
    yUnit: "%",
    countries: WORLD,
    decimals: 1,
  },
  {
    code: "SH.IMM.MEAS",
    slug: "measles-vaccination",
    title: "Toddlers vaccinated against measles in {country}",
    question:
      "Percent of children aged 12-23 months who received a measles vaccine. Draw what happened after {year}.",
    yLabel: "% of children",
    yUnit: "%",
    countries: US_AND_WORLD,
    minYear: 1980,
    decimals: 1,
  },
  {
    code: "SH.IMM.IDPT",
    slug: "dpt-vaccination",
    title: "Toddlers vaccinated against diphtheria, tetanus and whooping cough in {country}",
    question:
      "Percent of children aged 12-23 months who received the DPT vaccine. Draw what happened after {year}.",
    yLabel: "% of children",
    yUnit: "%",
    countries: US_AND_WORLD,
    minYear: 1980,
    decimals: 1,
  },
  {
    code: "SH.TBS.CURE.ZS",
    slug: "tb-treatment-success",
    title: "Tuberculosis patients successfully treated in {country}",
    question: "Percent of new TB cases that were cured. Draw what happened after {year}.",
    yLabel: "% of cases",
    yUnit: "%",
    countries: WORLD,
    decimals: 1,
  },

  // =========================================================================
  // BODIES, FOOD AND WATER
  // =========================================================================
  {
    code: "SH.STA.OWGH.ME.ZS",
    slug: "child-overweight",
    title: "Overweight young children in {country}",
    question: "Percent of children under five who are overweight. Draw what happened after {year}.",
    yLabel: "% of children under 5",
    yUnit: "%",
    countries: US_AND_WORLD,
    decimals: 1,
  },
  {
    code: "SH.STA.STNT.ME.ZS",
    slug: "child-stunting",
    title: "Children whose growth is stunted in {country}",
    question:
      "Percent of children under five who are too short for their age because of malnutrition. Draw what happened after {year}.",
    yLabel: "% of children under 5",
    yUnit: "%",
    countries: WORLD,
    decimals: 1,
  },
  {
    code: "SN.ITK.DEFC.ZS",
    slug: "undernourishment",
    title: "People who do not get enough to eat in {country}",
    question: "Percent of the population that is undernourished. Draw what happened after {year}.",
    yLabel: "% of population",
    yUnit: "%",
    countries: WORLD,
    decimals: 1,
  },
  {
    code: "SH.ANM.ALLW.ZS",
    slug: "anemia-in-women",
    title: "Women with anemia in {country}",
    question: "Percent of women aged 15-49 who are anemic. Draw what happened after {year}.",
    yLabel: "% of women 15-49",
    yUnit: "%",
    countries: US_AND_WORLD,
    decimals: 1,
  },
  {
    code: "SH.STA.BRTW.ZS",
    slug: "low-birthweight",
    title: "Babies born underweight in {country}",
    question: "Percent of births under 2,500 grams. Draw what happened after {year}.",
    yLabel: "% of births",
    yUnit: "%",
    countries: US_AND_WORLD,
    decimals: 1,
  },
  {
    code: "SH.H2O.SMDW.ZS",
    slug: "safe-drinking-water",
    title: "People with safely managed drinking water in {country}",
    question:
      "Percent of the population with safe water available at home when needed. Draw what happened after {year}.",
    yLabel: "% of population",
    yUnit: "%",
    countries: WORLD,
    decimals: 1,
  },
  {
    code: "SH.STA.SMSS.ZS",
    slug: "safe-sanitation",
    title: "People with safely managed sanitation in {country}",
    question:
      "Percent of the population whose waste is safely disposed of. Draw what happened after {year}.",
    yLabel: "% of population",
    yUnit: "%",
    countries: WORLD,
    decimals: 1,
  },
  {
    code: "SH.STA.ODFC.ZS",
    slug: "open-defecation",
    title: "People with no toilet at all in {country}",
    question: "Percent of the population practising open defecation. Draw what happened after {year}.",
    yLabel: "% of population",
    yUnit: "%",
    countries: WORLD,
    decimals: 1,
  },
  {
    code: "SH.H2O.BASW.ZS",
    slug: "basic-drinking-water",
    title: "People with basic drinking water access in {country}",
    question:
      "Percent of the population with a protected water source within a 30-minute round trip. Draw what happened after {year}.",
    yLabel: "% of population",
    yUnit: "%",
    countries: WORLD,
    decimals: 1,
  },

  // =========================================================================
  // HEALTH CARE AND WHAT IT COSTS
  // =========================================================================
  {
    code: "SH.XPD.CHEX.GD.ZS",
    slug: "health-spending-share",
    title: "Share of the economy spent on health care in {country}",
    question: "Total health spending as a percent of GDP. Draw what happened after {year}.",
    yLabel: "% of GDP",
    yUnit: "%",
    countries: US_AND_WORLD,
    decimals: 1,
  },
  {
    code: "SH.XPD.CHEX.PP.CD",
    slug: "health-spending-per-person",
    title: "Health spending per person in {country}",
    question:
      "Total health spending per person, in internationally comparable dollars. Draw what happened after {year}.",
    yLabel: "International $ per person",
    yUnit: "$",
    countries: US_AND_WORLD,
    decimals: 0,
  },
  {
    code: "SH.XPD.OOPC.CH.ZS",
    slug: "out-of-pocket-health-costs",
    title: "Share of health costs paid out of pocket in {country}",
    question:
      "Percent of health spending paid directly by patients. Draw what happened after {year}.",
    yLabel: "% of health spending",
    yUnit: "%",
    countries: US_AND_WORLD,
    decimals: 1,
  },
  {
    code: "SH.XPD.GHED.CH.ZS",
    slug: "government-share-of-health-costs",
    title: "Share of health costs paid by government in {country}",
    question: "Percent of health spending funded by government. Draw what happened after {year}.",
    yLabel: "% of health spending",
    yUnit: "%",
    countries: US,
    decimals: 1,
  },
  {
    code: "SH.MED.BEDS.ZS",
    slug: "hospital-beds",
    title: "Hospital beds in {country}",
    question: "Hospital beds per 1,000 people. Draw what happened after {year}.",
    yLabel: "Beds per 1,000 people",
    yUnit: "per 1,000",
    countries: US,
    decimals: 1,
  },
  {
    code: "SH.MED.NUMW.P3",
    slug: "nurses-and-midwives",
    title: "Nurses and midwives in {country}",
    question: "Nurses and midwives per 1,000 people. Draw what happened after {year}.",
    yLabel: "Per 1,000 people",
    yUnit: "per 1,000",
    countries: US,
    decimals: 1,
  },
  {
    code: "SH_UHC_SCI",
    slug: "health-coverage-index",
    title: "Universal health coverage score in {country}",
    question:
      "A 0-100 index of how much essential health care people actually receive. Draw what happened after {year}.",
    yLabel: "Index (0-100)",
    yUnit: "index",
    countries: US_AND_WORLD,
    decimals: 1,
  },
  {
    code: "SH.SGR.CRSK.ZS",
    slug: "catastrophic-surgery-cost-risk",
    title: "People at risk of ruinous surgery bills in {country}",
    question:
      "Percent of people at risk of catastrophic expenditure if they need surgery. Draw what happened after {year}.",
    yLabel: "% at risk",
    yUnit: "%",
    countries: WORLD,
    decimals: 1,
  },

  // =========================================================================
  // BIRTHS, FAMILIES AND AGE
  // =========================================================================
  {
    code: "SP.ADO.TFRT",
    slug: "teen-birth-rate",
    title: "Births to teenage mothers in {country}",
    question: "Births per 1,000 women aged 15-19. Draw what happened after {year}.",
    yLabel: "Births per 1,000 women 15-19",
    yUnit: "per 1,000",
    countries: US_AND_WORLD,
    minYear: 1960,
    decimals: 1,
  },
  {
    code: "SP.DYN.TFRT.IN",
    slug: "fertility-rate",
    title: "Children born per woman in {country}",
    question:
      "Average number of children a woman would have in her lifetime. Draw what happened after {year}.",
    yLabel: "Births per woman",
    yUnit: "children",
    countries: US_AND_WORLD,
    minYear: 1960,
    decimals: 2,
  },
  {
    code: "SP.DYN.CBRT.IN",
    slug: "birth-rate",
    title: "Births per 1,000 people in {country}",
    question: "Total births in a year per 1,000 people. Draw what happened after {year}.",
    yLabel: "Births per 1,000 people",
    yUnit: "per 1,000",
    countries: US_AND_WORLD,
    minYear: 1960,
    decimals: 1,
  },
  {
    code: "SP.POP.65UP.TO.ZS",
    slug: "population-over-65",
    title: "Share of the population over 65 in {country}",
    question: "Percent of people aged 65 and older. Draw what happened after {year}.",
    yLabel: "% of population",
    yUnit: "%",
    countries: US_AND_WORLD,
    minYear: 1960,
    decimals: 1,
  },
  {
    code: "SP.POP.0014.TO.ZS",
    slug: "population-under-15",
    title: "Share of the population under 15 in {country}",
    question: "Percent of people aged 14 and younger. Draw what happened after {year}.",
    yLabel: "% of population",
    yUnit: "%",
    countries: US_AND_WORLD,
    minYear: 1960,
    decimals: 1,
  },
  {
    code: "SP.POP.DPND.OL",
    slug: "old-age-dependency",
    title: "Retirement-age people per 100 working-age adults in {country}",
    question: "People over 65 for every 100 people of working age. Draw what happened after {year}.",
    yLabel: "Per 100 working-age adults",
    yUnit: "ratio",
    countries: US_AND_WORLD,
    minYear: 1960,
    decimals: 1,
  },
  {
    code: "SP.POP.GROW",
    slug: "population-growth",
    title: "Population growth rate in {country}",
    question: "How fast the population grew, in percent per year. Draw what happened after {year}.",
    yLabel: "% per year",
    yUnit: "%",
    countries: US_AND_WORLD,
    minYear: 1961,
    decimals: 2,
  },
  {
    code: "SP.POP.BRTH.MF",
    slug: "sex-ratio-at-birth",
    title: "Boys born per girl in {country}",
    question: "Male births per female birth. Draw what happened after {year}.",
    yLabel: "Male births per female birth",
    yUnit: "ratio",
    countries: WORLD,
    decimals: 3,
  },

  // =========================================================================
  // WHERE PEOPLE LIVE AND MOVE
  // =========================================================================
  {
    code: "SP.URB.TOTL.IN.ZS",
    slug: "urban-population-share",
    title: "Share of people living in cities in {country}",
    question: "Percent of the population living in urban areas. Draw what happened after {year}.",
    yLabel: "% of population",
    yUnit: "%",
    countries: US_AND_WORLD,
    minYear: 1960,
    decimals: 1,
  },
  {
    code: "EN.URB.MCTY.TL.ZS",
    slug: "million-plus-city-share",
    title: "Share of people living in cities over a million in {country}",
    question:
      "Percent of the population in urban areas of more than one million people. Draw what happened after {year}.",
    yLabel: "% of population",
    yUnit: "%",
    countries: US_AND_WORLD,
    minYear: 1960,
    decimals: 1,
  },
  {
    code: "EN.POP.DNST",
    slug: "population-density",
    title: "Population density in {country}",
    question: "People per square kilometre of land. Draw what happened after {year}.",
    yLabel: "People per sq. km",
    yUnit: "per sq km",
    countries: US,
    minYear: 1961,
    decimals: 1,
  },
  {
    code: "SM.POP.NETM",
    slug: "net-migration",
    title: "Net migration into {country}",
    question: "Arrivals minus departures over each period. Draw what happened after {year}.",
    yLabel: "Net migrants",
    yUnit: "people",
    countries: US,
    decimals: 0,
  },
  {
    code: "SM.POP.RHCR.EA",
    slug: "refugees-hosted",
    title: "Refugees hosted by {country}",
    question:
      "People under the UN refugee agency's mandate living in the country. Draw what happened after {year}.",
    yLabel: "Refugees",
    yUnit: "people",
    countries: US_AND_WORLD,
    decimals: 0,
  },
  {
    code: "SM.POP.ASYS.EA",
    slug: "asylum-seekers-hosted",
    title: "Asylum seekers in {country}",
    question: "People with pending asylum claims. Draw what happened after {year}.",
    yLabel: "Asylum seekers",
    yUnit: "people",
    countries: US_AND_WORLD,
    decimals: 0,
  },

  // =========================================================================
  // WORK
  // =========================================================================
  {
    code: "SL.UEM.TOTL.ZS",
    slug: "unemployment-rate",
    title: "Unemployment rate in {country}",
    question:
      "Percent of the labour force without work but looking for it. Draw what happened after {year}.",
    yLabel: "% of labour force",
    yUnit: "%",
    countries: US_AND_WORLD,
    decimals: 1,
  },
  {
    code: "SL.UEM.1524.ZS",
    slug: "youth-unemployment",
    title: "Youth unemployment in {country}",
    question:
      "Percent of 15-24 year olds in the labour force who are unemployed. Draw what happened after {year}.",
    yLabel: "% of labour force aged 15-24",
    yUnit: "%",
    countries: US_AND_WORLD,
    decimals: 1,
  },
  {
    code: "SL.UEM.ADVN.ZS",
    slug: "graduate-unemployment",
    title: "Unemployment among college graduates in {country}",
    question:
      "Percent of workers with advanced education who are unemployed. Draw what happened after {year}.",
    yLabel: "% of graduates in labour force",
    yUnit: "%",
    countries: US,
    decimals: 1,
  },
  {
    code: "SL.TLF.CACT.FE.ZS",
    slug: "female-labor-force-participation",
    title: "Share of women in the workforce in {country}",
    question:
      "Percent of women aged 15 and over who are working or looking for work. Draw what happened after {year}.",
    yLabel: "% of women 15+",
    yUnit: "%",
    countries: US_AND_WORLD,
    decimals: 1,
  },
  {
    code: "SL.TLF.CACT.MA.ZS",
    slug: "male-labor-force-participation",
    title: "Share of men in the workforce in {country}",
    question:
      "Percent of men aged 15 and over who are working or looking for work. Draw what happened after {year}.",
    yLabel: "% of men 15+",
    yUnit: "%",
    countries: US_AND_WORLD,
    decimals: 1,
  },
  {
    code: "SL.EMP.TOTL.SP.ZS",
    slug: "employment-to-population",
    title: "Share of adults with a job in {country}",
    question: "Percent of people aged 15 and over who are employed. Draw what happened after {year}.",
    yLabel: "% of population 15+",
    yUnit: "%",
    countries: US,
    decimals: 1,
  },
  {
    code: "SL.EMP.1524.SP.ZS",
    slug: "young-adult-employment",
    title: "Share of 15-24 year olds with a job in {country}",
    question: "Percent of young people aged 15-24 who are employed. Draw what happened after {year}.",
    yLabel: "% of population 15-24",
    yUnit: "%",
    countries: US,
    decimals: 1,
  },
  {
    code: "SL.UEM.NEET.ZS",
    slug: "youth-not-in-work-or-school",
    title: "Young people not in work, education or training in {country}",
    question: "Percent of youth who are neither studying nor employed. Draw what happened after {year}.",
    yLabel: "% of youth",
    yUnit: "%",
    countries: US,
    decimals: 1,
  },
  {
    code: "SL.AGR.EMPL.ZS",
    slug: "employment-in-agriculture",
    title: "Share of workers in agriculture in {country}",
    question: "Percent of employment in farming, forestry and fishing. Draw what happened after {year}.",
    yLabel: "% of employment",
    yUnit: "%",
    countries: US_AND_WORLD,
    decimals: 1,
  },
  {
    code: "SL.IND.EMPL.ZS",
    slug: "employment-in-industry",
    title: "Share of workers in industry in {country}",
    question:
      "Percent of employment in manufacturing, mining and construction. Draw what happened after {year}.",
    yLabel: "% of employment",
    yUnit: "%",
    countries: US_AND_WORLD,
    decimals: 1,
  },
  {
    code: "SL.SRV.EMPL.ZS",
    slug: "employment-in-services",
    title: "Share of workers in services in {country}",
    question: "Percent of employment in the service sector. Draw what happened after {year}.",
    yLabel: "% of employment",
    yUnit: "%",
    countries: US_AND_WORLD,
    decimals: 1,
  },
  {
    code: "SL.EMP.SELF.ZS",
    slug: "self-employment",
    title: "Share of workers who are self-employed in {country}",
    question: "Percent of employment that is self-employment. Draw what happened after {year}.",
    yLabel: "% of employment",
    yUnit: "%",
    countries: US_AND_WORLD,
    decimals: 1,
  },
  {
    code: "SL.TLF.PART.ZS",
    slug: "part-time-employment",
    title: "Share of workers employed part time in {country}",
    question: "Percent of total employment that is part time. Draw what happened after {year}.",
    yLabel: "% of employment",
    yUnit: "%",
    countries: US,
    decimals: 1,
  },
  {
    code: "SL.EMP.SMGT.FE.ZS",
    slug: "women-in-management",
    title: "Share of managers who are women in {country}",
    question:
      "Percent of senior and middle management positions held by women. Draw what happened after {year}.",
    yLabel: "% of managers",
    yUnit: "%",
    countries: US,
    decimals: 1,
  },
  {
    code: "SL.TLF.TOTL.FE.ZS",
    slug: "female-share-of-labor-force",
    title: "Share of the workforce that is female in {country}",
    question: "Percent of the labour force that is women. Draw what happened after {year}.",
    yLabel: "% of labour force",
    yUnit: "%",
    countries: US_AND_WORLD,
    decimals: 1,
  },
  {
    code: "SL.TLF.CACT.FM.ZS",
    slug: "female-to-male-workforce-ratio",
    title: "Women in the workforce for every 100 men in {country}",
    question:
      "Female labour force participation as a percent of male participation. Draw what happened after {year}.",
    yLabel: "Female rate as % of male rate",
    yUnit: "%",
    countries: WORLD,
    decimals: 1,
  },
  {
    code: "SL.EMP.VULN.ZS",
    slug: "vulnerable-employment",
    title: "Workers in insecure employment in {country}",
    question:
      "Percent of workers who are self-employed or unpaid family workers, with no wage contract. Draw what happened after {year}.",
    yLabel: "% of employment",
    yUnit: "%",
    countries: WORLD,
    decimals: 1,
  },
  {
    code: "SL.GDP.PCAP.EM.KD",
    slug: "output-per-worker",
    title: "Economic output per worker in {country}",
    question:
      "GDP produced per employed person, in constant international dollars. Draw what happened after {year}.",
    yLabel: "Constant 2021 PPP $",
    yUnit: "$",
    countries: US_AND_WORLD,
    decimals: 0,
  },

  // =========================================================================
  // MONEY AND INEQUALITY
  // =========================================================================
  {
    code: "NY.GDP.PCAP.KD",
    slug: "gdp-per-person",
    title: "Economic output per person in {country}",
    question: "GDP per person in constant 2015 dollars. Draw what happened after {year}.",
    yLabel: "Constant 2015 US$",
    yUnit: "$",
    countries: US_AND_WORLD,
    minYear: 1960,
    decimals: 0,
  },
  {
    code: "NY.GDP.MKTP.KD.ZG",
    slug: "economic-growth",
    title: "Economic growth in {country}",
    question: "Annual change in GDP, in percent. Draw what happened after {year}.",
    yLabel: "% per year",
    yUnit: "%",
    countries: US_AND_WORLD,
    minYear: 1961,
    decimals: 2,
  },
  {
    code: "FP.CPI.TOTL.ZG",
    slug: "inflation",
    title: "Inflation in {country}",
    question: "Annual change in consumer prices, in percent. Draw what happened after {year}.",
    yLabel: "% per year",
    yUnit: "%",
    countries: US_AND_WORLD,
    minYear: 1960,
    decimals: 2,
  },
  {
    code: "SI.POV.GINI",
    slug: "income-inequality",
    title: "Income inequality in {country}",
    question:
      "The Gini index, where 0 is perfect equality and 100 is one person holding everything. Draw what happened after {year}.",
    yLabel: "Gini index",
    yUnit: "index",
    countries: US,
    decimals: 1,
  },
  {
    code: "SI.DST.10TH.10",
    slug: "top-10-percent-income-share",
    title: "Share of income going to the richest tenth in {country}",
    question: "Percent of all income held by the top 10%. Draw what happened after {year}.",
    yLabel: "% of income",
    yUnit: "%",
    countries: US,
    decimals: 1,
  },
  {
    code: "SI.DST.FRST.20",
    slug: "bottom-20-percent-income-share",
    title: "Share of income going to the poorest fifth in {country}",
    question: "Percent of all income held by the bottom 20%. Draw what happened after {year}.",
    yLabel: "% of income",
    yUnit: "%",
    countries: US,
    decimals: 1,
  },
  {
    code: "SI.DST.50MD",
    slug: "relative-poverty",
    title: "People living on less than half the typical income in {country}",
    question: "Percent of people below 50% of median income. Draw what happened after {year}.",
    yLabel: "% of population",
    yUnit: "%",
    countries: US,
    decimals: 1,
  },
  {
    code: "SI.POV.SOPO",
    slug: "societal-poverty",
    title: "People below the societal poverty line in {country}",
    question:
      "Percent of people poor relative to what their own society considers normal. Draw what happened after {year}.",
    yLabel: "% of population",
    yUnit: "%",
    countries: US,
    decimals: 1,
  },
  {
    code: "NY.GNS.ICTR.ZS",
    slug: "savings-rate",
    title: "Share of income saved in {country}",
    question: "Gross national savings as a percent of GDP. Draw what happened after {year}.",
    yLabel: "% of GDP",
    yUnit: "%",
    countries: US_AND_WORLD,
    minYear: 1970,
    decimals: 1,
  },
  {
    code: "NE.CON.PRVT.ZS",
    slug: "household-consumption-share",
    title: "Share of the economy that is household spending in {country}",
    question: "Household consumption as a percent of GDP. Draw what happened after {year}.",
    yLabel: "% of GDP",
    yUnit: "%",
    countries: US_AND_WORLD,
    minYear: 1970,
    decimals: 1,
  },
  {
    code: "BX.TRF.PWKR.DT.GD.ZS",
    slug: "remittances-received",
    title: "Money sent home by migrant workers to {country}",
    question: "Personal remittances received as a percent of GDP. Draw what happened after {year}.",
    yLabel: "% of GDP",
    yUnit: "%",
    countries: WORLD,
    decimals: 2,
  },

  // =========================================================================
  // GOVERNMENT, TAX AND THE MILITARY
  // =========================================================================
  {
    code: "GC.DOD.TOTL.GD.ZS",
    slug: "government-debt",
    title: "Central government debt in {country}",
    question: "Government debt as a percent of GDP. Draw what happened after {year}.",
    yLabel: "% of GDP",
    yUnit: "%",
    countries: US,
    decimals: 1,
  },
  {
    code: "GC.TAX.TOTL.GD.ZS",
    slug: "tax-revenue",
    title: "Tax revenue collected in {country}",
    question: "Tax revenue as a percent of GDP. Draw what happened after {year}.",
    yLabel: "% of GDP",
    yUnit: "%",
    countries: US,
    decimals: 1,
  },
  {
    code: "GC.TAX.YPKG.ZS",
    slug: "income-tax-share",
    title: "Share of taxes coming from income and profits in {country}",
    question:
      "Taxes on income, profits and capital gains as a percent of all taxes. Draw what happened after {year}.",
    yLabel: "% of total taxes",
    yUnit: "%",
    countries: US,
    decimals: 1,
  },
  {
    code: "GC.XPN.INTP.ZS",
    slug: "debt-interest-share",
    title: "Share of government spending going to debt interest in {country}",
    question: "Interest payments as a percent of government expense. Draw what happened after {year}.",
    yLabel: "% of expense",
    yUnit: "%",
    countries: US,
    decimals: 1,
  },
  {
    code: "NE.CON.GOVT.ZS",
    slug: "government-spending-share",
    title: "Share of the economy that is government spending in {country}",
    question: "Government consumption as a percent of GDP. Draw what happened after {year}.",
    yLabel: "% of GDP",
    yUnit: "%",
    countries: US_AND_WORLD,
    minYear: 1970,
    decimals: 1,
  },
  {
    code: "MS.MIL.XPND.GD.ZS",
    slug: "military-spending",
    title: "Military spending in {country}",
    question: "Defence spending as a percent of GDP. Draw what happened after {year}.",
    yLabel: "% of GDP",
    yUnit: "%",
    countries: US_AND_WORLD,
    minYear: 1960,
    decimals: 2,
  },
  {
    code: "MS.MIL.TOTL.TF.ZS",
    slug: "armed-forces-share",
    title: "Share of the workforce in the armed forces in {country}",
    question: "Military personnel as a percent of the labour force. Draw what happened after {year}.",
    yLabel: "% of labour force",
    yUnit: "%",
    countries: US_AND_WORLD,
    decimals: 2,
  },
  {
    code: "MS.MIL.XPRT.KD",
    slug: "arms-exports",
    title: "Weapons exported by {country}",
    question:
      "Arms exports measured in SIPRI trend-indicator values. Draw what happened after {year}.",
    yLabel: "SIPRI trend indicator value",
    yUnit: "TIV",
    countries: US,
    decimals: 0,
  },
  {
    code: "SG.GEN.PARL.ZS",
    slug: "women-in-parliament",
    title: "Share of parliament seats held by women in {country}",
    question: "Percent of national parliament seats held by women. Draw what happened after {year}.",
    yLabel: "% of seats",
    yUnit: "%",
    countries: WORLD,
    decimals: 1,
  },

  // =========================================================================
  // TRADE AND WHAT THE ECONOMY IS MADE OF
  // =========================================================================
  {
    code: "NE.TRD.GNFS.ZS",
    slug: "trade-share",
    title: "Trade as a share of the economy in {country}",
    question: "Exports plus imports as a percent of GDP. Draw what happened after {year}.",
    yLabel: "% of GDP",
    yUnit: "%",
    countries: US_AND_WORLD,
    minYear: 1970,
    decimals: 1,
  },
  {
    code: "NE.IMP.GNFS.ZS",
    slug: "imports-share",
    title: "Imports as a share of the economy in {country}",
    question: "Imports of goods and services as a percent of GDP. Draw what happened after {year}.",
    yLabel: "% of GDP",
    yUnit: "%",
    countries: US,
    minYear: 1970,
    decimals: 1,
  },
  {
    code: "NV.IND.MANF.ZS",
    slug: "manufacturing-share",
    title: "Manufacturing as a share of the economy in {country}",
    question: "Manufacturing value added as a percent of GDP. Draw what happened after {year}.",
    yLabel: "% of GDP",
    yUnit: "%",
    countries: US_AND_WORLD,
    minYear: 1970,
    decimals: 1,
  },
  {
    code: "NV.SRV.TOTL.ZS",
    slug: "services-share",
    title: "Services as a share of the economy in {country}",
    question: "Service sector value added as a percent of GDP. Draw what happened after {year}.",
    yLabel: "% of GDP",
    yUnit: "%",
    countries: US_AND_WORLD,
    minYear: 1970,
    decimals: 1,
  },
  {
    code: "NV.AGR.TOTL.ZS",
    slug: "agriculture-share",
    title: "Farming as a share of the economy in {country}",
    question:
      "Agriculture, forestry and fishing value added as a percent of GDP. Draw what happened after {year}.",
    yLabel: "% of GDP",
    yUnit: "%",
    countries: US_AND_WORLD,
    minYear: 1970,
    decimals: 2,
  },
  {
    code: "TX.VAL.TECH.MF.ZS",
    slug: "high-tech-exports",
    title: "High-technology share of exports from {country}",
    question:
      "Percent of manufactured exports that are high-technology goods. Draw what happened after {year}.",
    yLabel: "% of manufactured exports",
    yUnit: "%",
    countries: US_AND_WORLD,
    decimals: 1,
  },
  {
    code: "BX.KLT.DINV.WD.GD.ZS",
    slug: "foreign-investment-in",
    title: "Foreign investment flowing into {country}",
    question:
      "Net foreign direct investment inflows as a percent of GDP. Draw what happened after {year}.",
    yLabel: "% of GDP",
    yUnit: "%",
    countries: US_AND_WORLD,
    minYear: 1975,
    decimals: 2,
  },
  {
    code: "ST.INT.RCPT.XP.ZS",
    slug: "tourism-share-of-exports",
    title: "Tourism as a share of exports from {country}",
    question:
      "International tourism receipts as a percent of total exports. Draw what happened after {year}.",
    yLabel: "% of exports",
    yUnit: "%",
    countries: US_AND_WORLD,
    decimals: 1,
  },

  // =========================================================================
  // FINANCE
  // =========================================================================
  {
    code: "CM.MKT.LDOM.NO",
    slug: "listed-companies",
    title: "Companies listed on the stock market in {country}",
    question: "Number of domestic companies listed on stock exchanges. Draw what happened after {year}.",
    yLabel: "Listed companies",
    yUnit: "companies",
    countries: US,
    decimals: 0,
  },
  {
    code: "CM.MKT.LCAP.GD.ZS",
    slug: "stock-market-size",
    title: "Stock market value relative to the economy in {country}",
    question:
      "Market capitalisation of listed companies as a percent of GDP. Draw what happened after {year}.",
    yLabel: "% of GDP",
    yUnit: "%",
    countries: US_AND_WORLD,
    decimals: 1,
  },
  {
    code: "FB.CBK.BRCH.P5",
    slug: "bank-branches",
    title: "Bank branches in {country}",
    question: "Commercial bank branches per 100,000 adults. Draw what happened after {year}.",
    yLabel: "Branches per 100,000 adults",
    yUnit: "per 100,000",
    countries: US,
    decimals: 1,
  },
  {
    code: "FB.ATM.TOTL.P5",
    slug: "atms",
    title: "Cash machines in {country}",
    question: "ATMs per 100,000 adults. Draw what happened after {year}.",
    yLabel: "ATMs per 100,000 adults",
    yUnit: "per 100,000",
    countries: WORLD,
    decimals: 1,
  },
  {
    code: "FD.AST.PRVT.GD.ZS",
    slug: "bank-lending",
    title: "Bank lending to businesses and households in {country}",
    question: "Domestic credit from banks as a percent of GDP. Draw what happened after {year}.",
    yLabel: "% of GDP",
    yUnit: "%",
    countries: US_AND_WORLD,
    minYear: 1970,
    decimals: 1,
  },
  {
    code: "FR.INR.RINR",
    slug: "real-interest-rate",
    title: "Real interest rate in {country}",
    question: "Lending rate adjusted for inflation, in percent. Draw what happened after {year}.",
    yLabel: "%",
    yUnit: "%",
    countries: US,
    decimals: 2,
  },

  // =========================================================================
  // EMISSIONS AND CLIMATE
  // =========================================================================
  {
    code: "EN.GHG.CO2.MT.CE.AR5",
    slug: "co2-emissions",
    title: "Carbon dioxide emissions from {country}",
    question: "Total CO2 emissions in millions of tonnes. Draw what happened after {year}.",
    yLabel: "Mt CO2e",
    yUnit: "Mt",
    countries: US_AND_WORLD,
    decimals: 1,
  },
  {
    code: "EN.GHG.CO2.PC.CE.AR5",
    slug: "co2-per-person",
    title: "Carbon dioxide emissions per person in {country}",
    question: "Tonnes of CO2 emitted per person per year. Draw what happened after {year}.",
    yLabel: "t CO2e per person",
    yUnit: "tonnes",
    countries: US_AND_WORLD,
    decimals: 2,
  },
  {
    code: "EN.GHG.CO2.TR.MT.CE.AR5",
    slug: "co2-from-transport",
    title: "Carbon dioxide emissions from transport in {country}",
    question: "CO2 from transport in millions of tonnes. Draw what happened after {year}.",
    yLabel: "Mt CO2e",
    yUnit: "Mt",
    countries: US_AND_WORLD,
    decimals: 1,
  },
  {
    code: "EN.GHG.CO2.PI.MT.CE.AR5",
    slug: "co2-from-power",
    title: "Carbon dioxide emissions from electricity generation in {country}",
    question: "CO2 from the power industry in millions of tonnes. Draw what happened after {year}.",
    yLabel: "Mt CO2e",
    yUnit: "Mt",
    countries: US_AND_WORLD,
    decimals: 1,
  },
  {
    code: "EN.GHG.CH4.MT.CE.AR5",
    slug: "methane-emissions",
    title: "Methane emissions from {country}",
    question:
      "Methane emissions in millions of tonnes of CO2 equivalent. Draw what happened after {year}.",
    yLabel: "Mt CO2e",
    yUnit: "Mt",
    countries: US_AND_WORLD,
    decimals: 1,
  },
  {
    code: "EN.GHG.CH4.AG.MT.CE.AR5",
    slug: "methane-from-agriculture",
    title: "Methane emissions from farming in {country}",
    question:
      "Agricultural methane in millions of tonnes of CO2 equivalent. Draw what happened after {year}.",
    yLabel: "Mt CO2e",
    yUnit: "Mt",
    countries: US_AND_WORLD,
    decimals: 1,
  },
  {
    code: "EN.GHG.ALL.PC.CE.AR5",
    slug: "greenhouse-gas-per-person",
    title: "Total greenhouse gas emissions per person in {country}",
    question:
      "All greenhouse gases, in tonnes of CO2 equivalent per person. Draw what happened after {year}.",
    yLabel: "t CO2e per person",
    yUnit: "tonnes",
    countries: US_AND_WORLD,
    decimals: 2,
  },
  {
    code: "EN.GHG.CO2.RT.GDP.KD",
    slug: "carbon-intensity",
    title: "Carbon emitted per dollar of output in {country}",
    question: "Kilograms of CO2 per constant 2015 dollar of GDP. Draw what happened after {year}.",
    yLabel: "kg CO2e per $",
    yUnit: "kg/$",
    countries: US_AND_WORLD,
    decimals: 3,
  },
  {
    code: "EN.GHG.CO2.LU.DF.MT.CE.AR5",
    slug: "deforestation-emissions",
    title: "Carbon released by deforestation in {country}",
    question: "CO2 from deforestation in millions of tonnes. Draw what happened after {year}.",
    yLabel: "Mt CO2e",
    yUnit: "Mt",
    countries: WORLD,
    decimals: 1,
  },
  {
    code: "EN.ATM.PM25.MC.M3",
    slug: "air-pollution",
    title: "Fine particle air pollution in {country}",
    question: "Average PM2.5 exposure in micrograms per cubic metre. Draw what happened after {year}.",
    yLabel: "Micrograms per cubic metre",
    yUnit: "ug/m3",
    countries: US_AND_WORLD,
    decimals: 1,
  },

  // =========================================================================
  // ENERGY
  // =========================================================================
  {
    code: "EG.ELC.COAL.ZS",
    slug: "electricity-from-coal",
    title: "Share of electricity generated from coal in {country}",
    question: "Percent of electricity produced from coal. Draw what happened after {year}.",
    yLabel: "% of electricity",
    yUnit: "%",
    countries: US_AND_WORLD,
    decimals: 1,
  },
  {
    code: "EG.ELC.NGAS.ZS",
    slug: "electricity-from-gas",
    title: "Share of electricity generated from natural gas in {country}",
    question: "Percent of electricity produced from natural gas. Draw what happened after {year}.",
    yLabel: "% of electricity",
    yUnit: "%",
    countries: US_AND_WORLD,
    decimals: 1,
  },
  {
    code: "EG.ELC.NUCL.ZS",
    slug: "electricity-from-nuclear",
    title: "Share of electricity generated from nuclear power in {country}",
    question: "Percent of electricity produced from nuclear reactors. Draw what happened after {year}.",
    yLabel: "% of electricity",
    yUnit: "%",
    countries: US_AND_WORLD,
    decimals: 1,
  },
  {
    code: "EG.ELC.RNWX.ZS",
    slug: "electricity-from-wind-and-solar",
    title: "Share of electricity from renewables other than hydro in {country}",
    question:
      "Percent of electricity from wind, solar and other non-hydro renewables. Draw what happened after {year}.",
    yLabel: "% of electricity",
    yUnit: "%",
    countries: US_AND_WORLD,
    decimals: 2,
  },
  {
    code: "EG.ELC.RNEW.ZS",
    slug: "renewable-electricity",
    title: "Share of electricity from all renewable sources in {country}",
    question:
      "Percent of electricity from renewables including hydro. Draw what happened after {year}.",
    yLabel: "% of electricity",
    yUnit: "%",
    countries: US_AND_WORLD,
    decimals: 1,
  },
  {
    code: "EG.ELC.HYRO.ZS",
    slug: "electricity-from-hydro",
    title: "Share of electricity generated from dams in {country}",
    question:
      "Percent of electricity produced from hydroelectric sources. Draw what happened after {year}.",
    yLabel: "% of electricity",
    yUnit: "%",
    countries: US_AND_WORLD,
    decimals: 1,
  },
  {
    code: "EG.FEC.RNEW.ZS",
    slug: "renewable-energy-share",
    title: "Share of all energy from renewables in {country}",
    question:
      "Renewables as a percent of total final energy consumption, not just electricity. Draw what happened after {year}.",
    yLabel: "% of energy",
    yUnit: "%",
    countries: US_AND_WORLD,
    decimals: 1,
  },
  {
    code: "EG.USE.COMM.FO.ZS",
    slug: "fossil-fuel-share",
    title: "Share of energy from fossil fuels in {country}",
    question: "Percent of total energy use that comes from fossil fuels. Draw what happened after {year}.",
    yLabel: "% of energy",
    yUnit: "%",
    countries: US_AND_WORLD,
    decimals: 1,
  },
  {
    code: "EG.IMP.CONS.ZS",
    slug: "energy-imports",
    title: "Share of energy that is imported in {country}",
    question:
      "Net energy imports as a percent of energy use. Below zero means the country exports more than it buys. Draw what happened after {year}.",
    yLabel: "% of energy use",
    yUnit: "%",
    countries: US,
    decimals: 1,
  },
  {
    code: "EG.USE.ELEC.KH.PC",
    slug: "electricity-per-person",
    title: "Electricity used per person in {country}",
    question: "Kilowatt-hours consumed per person per year. Draw what happened after {year}.",
    yLabel: "kWh per person",
    yUnit: "kWh",
    countries: US_AND_WORLD,
    decimals: 0,
  },
  {
    code: "EG.USE.PCAP.KG.OE",
    slug: "energy-per-person",
    title: "Total energy used per person in {country}",
    question: "Kilograms of oil equivalent per person per year. Draw what happened after {year}.",
    yLabel: "kg oil equivalent per person",
    yUnit: "kg",
    countries: US_AND_WORLD,
    decimals: 0,
  },
  {
    code: "EG.EGY.PRIM.PP.KD",
    slug: "energy-intensity",
    title: "Energy needed per dollar of output in {country}",
    question: "Megajoules of energy per dollar of GDP. Draw what happened after {year}.",
    yLabel: "MJ per $ of GDP",
    yUnit: "MJ",
    countries: US_AND_WORLD,
    decimals: 2,
  },
  {
    code: "EG.ELC.ACCS.ZS",
    slug: "electricity-access",
    title: "Share of people with electricity in {country}",
    question: "Percent of the population with access to electricity. Draw what happened after {year}.",
    yLabel: "% of population",
    yUnit: "%",
    countries: WORLD,
    decimals: 1,
  },
  {
    code: "EG.CFT.ACCS.ZS",
    slug: "clean-cooking-fuel",
    title: "Share of people cooking with clean fuel in {country}",
    question:
      "Percent of the population with clean cooking fuels and technology. Draw what happened after {year}.",
    yLabel: "% of population",
    yUnit: "%",
    countries: WORLD,
    decimals: 1,
  },
  {
    code: "NY.GDP.PETR.RT.ZS",
    slug: "oil-rents",
    title: "Value of oil production relative to the economy in {country}",
    question: "Oil rents as a percent of GDP. Draw what happened after {year}.",
    yLabel: "% of GDP",
    yUnit: "%",
    countries: US_AND_WORLD,
    decimals: 2,
  },

  // =========================================================================
  // LAND, FOOD AND NATURE
  // =========================================================================
  {
    code: "AG.LND.FRST.ZS",
    slug: "forest-area",
    title: "Share of land covered by forest in {country}",
    question: "Percent of land area that is forest. Draw what happened after {year}.",
    yLabel: "% of land area",
    yUnit: "%",
    countries: US_AND_WORLD,
    decimals: 2,
  },
  {
    code: "AG.LND.AGRI.ZS",
    slug: "agricultural-land",
    title: "Share of land used for farming in {country}",
    question: "Percent of land area used for agriculture. Draw what happened after {year}.",
    yLabel: "% of land area",
    yUnit: "%",
    countries: US_AND_WORLD,
    decimals: 2,
  },
  {
    code: "AG.LND.ARBL.HA.PC",
    slug: "cropland-per-person",
    title: "Cropland per person in {country}",
    question: "Hectares of arable land per person. Draw what happened after {year}.",
    yLabel: "Hectares per person",
    yUnit: "ha",
    countries: US_AND_WORLD,
    decimals: 3,
  },
  {
    code: "AG.YLD.CREL.KG",
    slug: "cereal-yield",
    title: "Grain harvested per hectare in {country}",
    question: "Cereal yield in kilograms per hectare. Draw what happened after {year}.",
    yLabel: "kg per hectare",
    yUnit: "kg",
    countries: US_AND_WORLD,
    minYear: 1961,
    decimals: 0,
  },
  {
    code: "AG.CON.FERT.ZS",
    slug: "fertilizer-use",
    title: "Fertiliser used per hectare in {country}",
    question: "Kilograms of fertiliser per hectare of arable land. Draw what happened after {year}.",
    yLabel: "kg per hectare",
    yUnit: "kg",
    countries: US_AND_WORLD,
    decimals: 1,
  },
  {
    code: "ER.FSH.AQUA.MT",
    slug: "farmed-fish",
    title: "Fish raised on farms in {country}",
    question: "Aquaculture production in metric tonnes. Draw what happened after {year}.",
    yLabel: "Metric tonnes",
    yUnit: "tonnes",
    countries: US_AND_WORLD,
    decimals: 0,
  },
  {
    code: "ER.FSH.CAPT.MT",
    slug: "wild-caught-fish",
    title: "Fish caught in the wild in {country}",
    question: "Capture fisheries production in metric tonnes. Draw what happened after {year}.",
    yLabel: "Metric tonnes",
    yUnit: "tonnes",
    countries: US_AND_WORLD,
    decimals: 0,
  },
  {
    code: "ER.H2O.INTR.PC",
    slug: "freshwater-per-person",
    title: "Renewable fresh water per person in {country}",
    question:
      "Cubic metres of internal renewable fresh water per person. Draw what happened after {year}.",
    yLabel: "Cubic metres per person",
    yUnit: "m3",
    countries: US_AND_WORLD,
    decimals: 0,
  },
  {
    code: "ER.H2O.FWTL.K3",
    slug: "water-withdrawals",
    title: "Fresh water withdrawn each year in {country}",
    question:
      "Total annual freshwater withdrawals in billions of cubic metres. Draw what happened after {year}.",
    yLabel: "Billion cubic metres",
    yUnit: "bn m3",
    countries: US,
    decimals: 2,
  },

  // =========================================================================
  // SCHOOL AND LITERACY
  // =========================================================================
  {
    code: "SE.ADT.LITR.ZS",
    slug: "adult-literacy",
    title: "Adults who can read and write in {country}",
    question: "Percent of people aged 15 and over who are literate. Draw what happened after {year}.",
    yLabel: "% of adults",
    yUnit: "%",
    countries: WORLD,
    decimals: 1,
  },
  {
    code: "SE.ADT.1524.LT.ZS",
    slug: "youth-literacy",
    title: "Young people who can read and write in {country}",
    question: "Percent of 15-24 year olds who are literate. Draw what happened after {year}.",
    yLabel: "% of youth",
    yUnit: "%",
    countries: WORLD,
    decimals: 1,
  },
  {
    code: "SE.ADT.LITR.FE.ZS",
    slug: "female-literacy",
    title: "Women who can read and write in {country}",
    question: "Percent of women aged 15 and over who are literate. Draw what happened after {year}.",
    yLabel: "% of women",
    yUnit: "%",
    countries: WORLD,
    decimals: 1,
  },
  {
    code: "SE.PRM.CMPT.ZS",
    slug: "primary-completion",
    title: "Children finishing primary school in {country}",
    question:
      "Primary completion rate as a percent of the relevant age group. Draw what happened after {year}.",
    yLabel: "% of age group",
    yUnit: "%",
    countries: WORLD,
    decimals: 1,
  },
  {
    code: "SE.SEC.CMPT.LO.ZS",
    slug: "lower-secondary-completion",
    title: "Children finishing middle school in {country}",
    question:
      "Lower secondary completion rate as a percent of the relevant age group. Draw what happened after {year}.",
    yLabel: "% of age group",
    yUnit: "%",
    countries: WORLD,
    decimals: 1,
  },
  {
    code: "SE.SEC.NENR",
    slug: "secondary-enrollment",
    title: "Children enrolled in secondary school in {country}",
    question: "Net secondary school enrolment rate. Draw what happened after {year}.",
    yLabel: "% net enrolment",
    yUnit: "%",
    countries: WORLD,
    decimals: 1,
  },
  {
    code: "SE.TER.ENRR",
    slug: "university-enrollment",
    title: "Young people enrolled in university in {country}",
    question: "Gross tertiary enrolment rate. Draw what happened after {year}.",
    yLabel: "% gross enrolment",
    yUnit: "%",
    countries: WORLD,
    decimals: 1,
  },
  {
    code: "SE.ENR.TERT.FM.ZS",
    slug: "university-gender-parity",
    title: "Women per man enrolled in university in {country}",
    question:
      "Female tertiary enrolment divided by male enrolment. Above 1 means more women than men. Draw what happened after {year}.",
    yLabel: "Ratio (female to male)",
    yUnit: "ratio",
    countries: WORLD,
    decimals: 3,
  },
  {
    code: "SE.PRM.ENRL.TC.ZS",
    slug: "primary-class-size",
    title: "Pupils per primary teacher in {country}",
    question: "Pupil-teacher ratio in primary school. Draw what happened after {year}.",
    yLabel: "Pupils per teacher",
    yUnit: "ratio",
    countries: WORLD,
    decimals: 1,
  },
  {
    code: "SE.XPD.TOTL.GD.ZS",
    slug: "education-spending",
    title: "Share of the economy spent on education in {country}",
    question: "Government education spending as a percent of GDP. Draw what happened after {year}.",
    yLabel: "% of GDP",
    yUnit: "%",
    countries: WORLD,
    decimals: 2,
  },
  {
    code: "SE.TER.CUAT.MS.ZS",
    slug: "masters-degrees",
    title: "Adults holding a master's degree or higher in {country}",
    question:
      "Percent of people aged 25 and over with at least a master's degree. Draw what happened after {year}.",
    yLabel: "% of adults 25+",
    yUnit: "%",
    countries: US,
    decimals: 1,
  },
  {
    code: "SE.TER.CUAT.DO.ZS",
    slug: "doctorates",
    title: "Adults holding a doctorate in {country}",
    question:
      "Percent of people aged 25 and over with a doctoral degree. Draw what happened after {year}.",
    yLabel: "% of adults 25+",
    yUnit: "%",
    countries: US,
    decimals: 2,
  },

  // =========================================================================
  // TECHNOLOGY, RESEARCH AND GETTING AROUND
  // =========================================================================
  {
    code: "IT.NET.USER.ZS",
    slug: "internet-users",
    title: "Share of people using the internet in {country}",
    question: "Percent of the population using the internet. Draw what happened after {year}.",
    yLabel: "% of population",
    yUnit: "%",
    countries: US_AND_WORLD,
    decimals: 1,
  },
  {
    code: "IT.NET.BBND.P2",
    slug: "broadband-subscriptions",
    title: "Home broadband subscriptions in {country}",
    question: "Fixed broadband subscriptions per 100 people. Draw what happened after {year}.",
    yLabel: "Per 100 people",
    yUnit: "per 100",
    countries: US_AND_WORLD,
    decimals: 2,
  },
  {
    code: "IT.MLT.MAIN.P2",
    slug: "landline-subscriptions",
    title: "Landline telephone subscriptions in {country}",
    question: "Fixed telephone lines per 100 people. Draw what happened after {year}.",
    yLabel: "Per 100 people",
    yUnit: "per 100",
    countries: US_AND_WORLD,
    minYear: 1970,
    decimals: 2,
  },
  {
    code: "GB.XPD.RSDV.GD.ZS",
    slug: "research-spending",
    title: "Share of the economy spent on research and development in {country}",
    question: "R&D expenditure as a percent of GDP. Draw what happened after {year}.",
    yLabel: "% of GDP",
    yUnit: "%",
    countries: US_AND_WORLD,
    decimals: 2,
  },
  {
    code: "IP.PAT.RESD",
    slug: "patent-applications",
    title: "Patent applications filed by residents of {country}",
    question: "Patent applications from residents each year. Draw what happened after {year}.",
    yLabel: "Applications",
    yUnit: "applications",
    countries: US,
    decimals: 0,
  },
  {
    code: "IP.TMK.RSCT",
    slug: "trademark-applications",
    title: "Trademark applications filed by residents of {country}",
    question: "Trademark applications from residents each year. Draw what happened after {year}.",
    yLabel: "Applications",
    yUnit: "applications",
    countries: US,
    decimals: 0,
  },
  {
    code: "IP.JRN.ARTC.SC",
    slug: "scientific-papers",
    title: "Scientific papers published from {country}",
    question:
      "Scientific and technical journal articles published each year. Draw what happened after {year}.",
    yLabel: "Articles",
    yUnit: "articles",
    countries: US_AND_WORLD,
    decimals: 0,
  },
  {
    code: "SP.POP.SCIE.RD.P6",
    slug: "researchers",
    title: "Researchers working in {country}",
    question: "Researchers in R&D per million people. Draw what happened after {year}.",
    yLabel: "Per million people",
    yUnit: "per million",
    countries: US,
    decimals: 0,
  },
  {
    code: "IS.AIR.PSGR",
    slug: "air-passengers",
    title: "Airline passengers carried in {country}",
    question: "Passengers carried by the country's registered carriers. Draw what happened after {year}.",
    yLabel: "Passengers",
    yUnit: "passengers",
    countries: US,
    decimals: 0,
  },
  {
    code: "IS.RRS.PASG.KM",
    slug: "rail-travel",
    title: "Rail travel in {country}",
    question: "Passenger-kilometres travelled by rail, in millions. Draw what happened after {year}.",
    yLabel: "Million passenger-km",
    yUnit: "m pkm",
    countries: US,
    decimals: 0,
  },

  // =========================================================================
  // WHERE THE COUNTRY ITSELF IS THE QUESTION
  // -------------------------------------------------------------------------
  // The deliberate minority. Each entry is here because the specific country
  // is what makes the shape surprising, not because an indicator needed
  // another country bolted onto it. The importer appends the ISO3 code to the
  // slug stem, so reusing a stem here produces a distinct slug
  // (life-expectancy-rus alongside life-expectancy-usa) with no collision.
  //
  // THE QUESTION MUST NEVER REVEAL THE SHAPE. The first draft of this section
  // framed each entry with an editorial hook - "a rich country whose
  // population passed its peak", "one of the countries that improved
  // fastest", "a country Americans routinely assume still has large
  // families". Every one of those hands the player the answer before they
  // draw, and this project exists to measure what people believe BEFORE they
  // are told. A prompt that leaks the direction does not collect a
  // misperception; it collects reading comprehension, and it quietly
  // corrupts the aggregate for that dataset with no visible symptom.
  //
  // So the rule is: the question text describes WHAT IS MEASURED and nothing
  // else, exactly as it does for the US and World entries. Context about why
  // a country is interesting is only admissible when it is neutral as to
  // direction - "spanning the one-child policy and its repeal" names an era
  // without saying which way the line went. If in doubt, leave it out; the
  // title already names the country, which is all the player needs.
  // =========================================================================
  {
    code: "SP.DYN.LE00.IN",
    slug: "life-expectancy",
    title: "Life expectancy at birth in {country}",
    question:
      "Years a newborn could expect to live. Draw what happened after {year}.",
    yLabel: "Years",
    yUnit: "years",
    countries: ["RUS"],
    minYear: 1960,
    decimals: 1,
  },
  {
    code: "SP.DYN.LE00.IN",
    slug: "life-expectancy",
    title: "Life expectancy at birth in {country}",
    question:
      "Years a newborn could expect to live. Draw what happened after {year}.",
    yLabel: "Years",
    yUnit: "years",
    countries: ["ZAF"],
    minYear: 1960,
    decimals: 1,
  },
  {
    code: "SP.DYN.TFRT.IN",
    slug: "fertility-rate",
    title: "Children born per woman in {country}",
    question:
      "Average number of children a woman would have in her lifetime. Draw what happened after {year}.",
    yLabel: "Births per woman",
    yUnit: "children",
    countries: ["KOR"],
    minYear: 1960,
    decimals: 2,
  },
  {
    code: "SP.DYN.TFRT.IN",
    slug: "fertility-rate",
    title: "Children born per woman in {country}",
    question:
      "Average number of children a woman would have in her lifetime, spanning the one-child policy and its repeal. Draw what happened after {year}.",
    yLabel: "Births per woman",
    yUnit: "children",
    countries: ["CHN"],
    minYear: 1960,
    decimals: 2,
  },
  {
    code: "SP.DYN.TFRT.IN",
    slug: "fertility-rate",
    title: "Children born per woman in {country}",
    question:
      "Average number of children a woman would have in her lifetime. Draw what happened after {year}.",
    yLabel: "Births per woman",
    yUnit: "children",
    countries: ["MEX"],
    minYear: 1960,
    decimals: 2,
  },
  {
    code: "SP.POP.TOTL",
    slug: "total-population",
    title: "Total population of {country}",
    question:
      "The total number of people living in the country. Draw what happened after {year}.",
    yLabel: "People",
    yUnit: "people",
    countries: ["JPN"],
    minYear: 1960,
    decimals: 0,
  },
  {
    code: "SP.POP.TOTL",
    slug: "total-population",
    title: "Total population of {country}",
    question:
      "The total number of people living in the country. Draw what happened after {year}.",
    yLabel: "People",
    yUnit: "people",
    countries: ["NGA"],
    minYear: 1960,
    decimals: 0,
  },
  {
    code: "SP.POP.65UP.TO.ZS",
    slug: "population-over-65",
    title: "Share of the population over 65 in {country}",
    question: "Percent of people aged 65 and older. Draw what happened after {year}.",
    yLabel: "% of population",
    yUnit: "%",
    countries: ["JPN"],
    minYear: 1960,
    decimals: 1,
  },
  {
    code: "EN.GHG.CO2.MT.CE.AR5",
    slug: "co2-emissions",
    title: "Carbon dioxide emissions from {country}",
    question:
      "Total CO2 emissions in millions of tonnes. Draw what happened after {year}.",
    yLabel: "Mt CO2e",
    yUnit: "Mt",
    countries: ["CHN"],
    decimals: 1,
  },
  {
    code: "NY.GDP.PCAP.KD",
    slug: "gdp-per-person",
    title: "Economic output per person in {country}",
    question:
      "GDP per person in constant 2015 dollars. Draw what happened after {year}.",
    yLabel: "Constant 2015 US$",
    yUnit: "$",
    countries: ["CHN"],
    minYear: 1960,
    decimals: 0,
  },
  {
    code: "EG.ELC.NUCL.ZS",
    slug: "electricity-from-nuclear",
    title: "Share of electricity generated from nuclear power in {country}",
    question:
      "Percent of electricity produced from nuclear reactors. Draw what happened after {year}.",
    yLabel: "% of electricity",
    yUnit: "%",
    countries: ["DEU"],
    decimals: 1,
  },
  {
    code: "EG.ELC.NUCL.ZS",
    slug: "electricity-from-nuclear",
    title: "Share of electricity generated from nuclear power in {country}",
    question:
      "Percent of electricity produced from nuclear reactors. Draw what happened after {year}.",
    yLabel: "% of electricity",
    yUnit: "%",
    countries: ["FRA"],
    decimals: 1,
  },
  {
    code: "EG.ELC.RNWX.ZS",
    slug: "electricity-from-wind-and-solar",
    title: "Share of electricity from renewables other than hydro in {country}",
    question:
      "Percent of electricity from wind, solar and other non-hydro renewables. Draw what happened after {year}.",
    yLabel: "% of electricity",
    yUnit: "%",
    countries: ["DEU"],
    decimals: 2,
  },
  {
    code: "AG.LND.FRST.ZS",
    slug: "forest-area",
    title: "Share of land covered by forest in {country}",
    question:
      "Percent of land area that is forest. Draw what happened after {year}.",
    yLabel: "% of land area",
    yUnit: "%",
    countries: ["BRA"],
    decimals: 2,
  },
  {
    code: "IT.NET.USER.ZS",
    slug: "internet-users",
    title: "Share of people using the internet in {country}",
    question:
      "Percent of the population using the internet. Draw what happened after {year}.",
    yLabel: "% of population",
    yUnit: "%",
    countries: ["IND"],
    decimals: 1,
  },
  {
    code: "SH.DYN.MORT",
    slug: "under-five-mortality",
    title: "Child deaths before age five in {country}",
    question:
      "Deaths before age five, per 1,000 live births. Draw what happened after {year}.",
    yLabel: "Deaths per 1,000 live births",
    yUnit: "per 1,000",
    countries: ["ETH"],
    minYear: 1960,
    decimals: 1,
  },
];
