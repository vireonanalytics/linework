/**
 * One-shot generator: turns researched dataset specs into
 * lib/datasets/<slug>.ts files plus their data/SOURCES.md rows.
 *
 * This is the Phase 5 content pipeline the roadmap named but never built:
 * a handful of real, sourced anchor points per dataset, piecewise-linearly
 * interpolated (lib/datasets/interpolate.ts) into an annual series. Every
 * dataset this produces ships `verified: false` - the anchors come from
 * research (web search + a light spot-check against primary sources), not
 * from a human who has pulled the exact annual series yet. See each dataset's
 * row in data/SOURCES.md for what specifically still needs checking.
 *
 * revealFromIndex defaults to ~60% of the way through the series for every
 * dataset here - a consistent, documented rule rather than bespoke-tuned per
 * dataset. Reasonable to adjust per-dataset later; not something worth
 * hand-crafting 20+ times before a single real number has been confirmed.
 *
 * Run with: node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/generate-datasets.ts
 * Safe to re-run - it only ever overwrites files for the slugs listed below.
 */

import { writeFileSync } from "node:fs";
import { interpolateAnnualSeries, type AnchorPoint } from "../lib/datasets/interpolate.ts";

type Spec = {
  slug: string;
  title: string;
  /**
   * The descriptive lead only - no "Draw what happened after X" clause. The
   * script appends that itself, using the actual computed reveal boundary
   * year, so it can never drift from what revealFromIndex really points at.
   */
  questionLead: string;
  yLabel: string;
  yUnit: string;
  anchors: AnchorPoint[];
  yDomainMax: number;
  sourceName: string;
  sourceUrl: string;
  methodologyNote: string;
  discontinuities: string;
  perceptionGap: string;
};

const REVEAL_FRACTION = 0.6;

export const SPECS: Spec[] = [
  {
    slug: "us-violent-crime-rate",
    title: "US violent crime rate, 1991-2023",
    questionLead: "Violent crimes per 100,000 people.",
    yLabel: "Violent crimes per 100,000 population",
    yUnit: "per 100,000",
    anchors: [
      { year: 1991, value: 758 },
      { year: 1999, value: 523 },
      { year: 2009, value: 429 },
      { year: 2015, value: 383 },
      { year: 2020, value: 399 },
      { year: 2023, value: 364 },
    ],
    yDomainMax: 800,
    sourceName: "FBI Uniform Crime Reporting Program / Crime Data Explorer",
    sourceUrl: "https://cde.ucr.cjis.gov/LATEST/webapp/#/pages/explorer/crime/crime-trend",
    methodologyNote:
      "National violent crime rate per 100,000 population, from FBI-collected agency reports.",
    discontinuities:
      "FBI transitioned agencies from the old Summary Reporting System (SRS) to incident-based NIBRS around 2021; many agencies did not report that year, making 2021 figures less reliable/comparable than surrounding years. The Bureau of Justice Statistics' NCVS victimization survey sometimes shows a different picture in the same year and is not the same series.",
    perceptionGap:
      "Gallup's annual Crime poll: in most years since 1993 (commonly 60-80% of respondents, e.g. 77% in Nov 2023), a majority say crime is up nationally from the prior year, even in years UCR data shows clear declines. https://news.gallup.com/poll/1603/crime.aspx",
  },
  {
    slug: "us-gun-homicide-rate",
    title: "US gun homicide rate, 1993-2024",
    questionLead: "Firearm homicides per 100,000 people.",
    yLabel: "Firearm homicides per 100,000 population",
    yUnit: "per 100,000",
    anchors: [
      { year: 1993, value: 7.0 },
      { year: 2000, value: 3.9 },
      { year: 2010, value: 3.6 },
      { year: 2020, value: 5.5 },
      { year: 2021, value: 6.7 },
      { year: 2024, value: 4.3 },
    ],
    yDomainMax: 8,
    sourceName: "CDC WISQARS / CDC WONDER Underlying Cause of Death",
    sourceUrl: "https://wisqars.cdc.gov/",
    methodologyNote: "Firearm homicide deaths per 100,000 population, CDC mortality data.",
    discontinuities:
      "Gun suicides moved in the opposite direction over the same period (rising to record highs) - 'gun deaths' overall vs. 'gun homicides' specifically are very different series; be precise about which one is shown.",
    perceptionGap:
      "Pew Research Center, 'Gun Homicide Rate Down 49% Since 1993 Peak; Public Unaware' (May 7, 2013) - confirmed directly: rate fell from 7.0 (1993) to 3.6 per 100,000 (2010), but 56% of Americans believed gun crime was higher than 20 years earlier and only 12% said lower. https://www.pewresearch.org/social-trends/2013/05/07/gun-homicide-rate-down-49-since-1993-peak-public-unaware/",
  },
  {
    slug: "us-life-expectancy",
    title: "US life expectancy at birth, 1990-2023",
    questionLead: "Years of life expectancy at birth.",
    yLabel: "Life expectancy at birth",
    yUnit: "years",
    anchors: [
      { year: 1990, value: 75.4 },
      { year: 2010, value: 78.7 },
      { year: 2019, value: 78.8 },
      { year: 2021, value: 76.1 },
      { year: 2023, value: 78.4 },
    ],
    yDomainMax: 82,
    sourceName: "CDC/NCHS National Vital Statistics System",
    sourceUrl: "https://www.cdc.gov/nchs/nvss/mortality_historical_data.htm",
    methodologyNote: "Period life expectancy at birth, all races/sexes combined.",
    discontinuities:
      "COVID-era provisional figures for 2020-2021 were revised somewhat after initial release. Methodology and cause-of-death coding are otherwise broadly consistent across the period.",
    perceptionGap:
      "YouGov survey, Sept 12-15 2022 (n=1,000 US adults): only 24% accurately placed US life expectancy in the 75-79 range; 31% guessed too high. https://yougov.com/en-us/articles/44154-what-do-americans-know-about-life-expectancy",
  },
  {
    slug: "us-drug-overdose-deaths",
    title: "US drug overdose death rate, 1999-2024",
    questionLead: "Overdose deaths per 100,000 people.",
    yLabel: "Drug overdose deaths per 100,000 population",
    yUnit: "per 100,000",
    anchors: [
      { year: 1999, value: 6.1 },
      { year: 2013, value: 13.8 },
      { year: 2021, value: 32.4 },
      { year: 2023, value: 31.3 },
      { year: 2024, value: 24.0 },
    ],
    yDomainMax: 35,
    sourceName: "CDC/NCHS Vital Statistics Rapid Release, Provisional Drug Overdose Data",
    sourceUrl: "https://www.cdc.gov/nchs/nvss/vsrr/drug-overdose-data.htm",
    methodologyNote: "Provisional and final annual drug overdose death rate per 100,000.",
    discontinuities:
      "Cause-of-death coding for specific drug categories has been revised multiple times; a meaningful share of death certificates historically lacked a specified drug (varies by state/year). Provisional counts are later revised upward as lagging reports arrive.",
    perceptionGap:
      "Pew Research Center, May 31 2022: public concern about drug addiction fell from 42% (2018) to 35% (2021) even as overdose deaths rose from ~70,000 to ~92,000 over the same window - and fell more in the counties hit hardest. https://www.pewresearch.org/short-reads/2022/05/31/concern-about-drug-addiction-has-declined-in-u-s-even-in-areas-where-fatal-overdoses-have-risen-the-most/",
  },
  {
    slug: "global-child-vaccination-rate",
    title: "Global child vaccination rate, 1980-2023",
    questionLead: "Share of 1-year-olds vaccinated worldwide.",
    yLabel: "1-year-olds vaccinated against at least one disease",
    yUnit: "%",
    anchors: [
      { year: 1980, value: 20 },
      { year: 2000, value: 72 },
      { year: 2019, value: 86 },
      { year: 2021, value: 81 },
      { year: 2023, value: 84 },
    ],
    yDomainMax: 100,
    sourceName: "WHO/UNICEF Estimates of National Immunization Coverage (WUENIC)",
    sourceUrl: "https://data.who.int/indicators/i/48D7D19/F8E084C",
    methodologyNote: "Modeled national immunization coverage estimates, WHO/UNICEF joint reporting.",
    discontinuities:
      "WUENIC estimates are periodically revised retroactively as countries submit better data; the specific antigen tracked (e.g. DTP3 vs. 'at least one vaccine') changes the exact curve.",
    perceptionGap:
      "Ipsos/Gapminder 'Mind the Gap' survey, 2017 (~12,000 respondents, 14 countries): only 13% correctly answered that ~88% of the world's 1-year-olds are vaccinated against some disease; 43% guessed only ~20%. https://www.gapminder.org/questions/gms1-9/",
  },
  {
    slug: "us-official-poverty-rate",
    title: "US official poverty rate, 1959-2023",
    questionLead: "Share of Americans below the poverty line.",
    yLabel: "People below the official poverty line",
    yUnit: "%",
    anchors: [
      { year: 1959, value: 22.4 },
      { year: 1973, value: 11.1 },
      { year: 2000, value: 11.3 },
      { year: 2010, value: 15.1 },
      { year: 2023, value: 11.1 },
    ],
    yDomainMax: 25,
    sourceName: "US Census Bureau, Historical Poverty Tables",
    sourceUrl: "https://www.census.gov/data/tables/time-series/demo/income-poverty/historical-poverty-people.html",
    methodologyNote: "Official poverty rate, Current Population Survey Annual Social and Economic Supplement.",
    discontinuities:
      "2013 CPS ASEC redesign changed the income questions used to compute the rate. The Supplemental Poverty Measure (SPM), introduced 2011, is a separate, non-comparable series often confused with the official rate.",
    perceptionGap:
      "Barna Group national phone survey, Jan 2007 (n=1,003): average guess for the poverty rate was 30%, versus the 12-15% range federal statistics had shown for the prior 40 years. https://www.barna.com/research/americans-are-misinformed-about-poverty-but-widely-involved-in-helping-the-poor/",
  },
  {
    slug: "top-1-percent-wealth-share",
    title: "Top 1% share of US household wealth, 1978-2022",
    questionLead: "Share of total household wealth held by the top 1%.",
    yLabel: "Share of total US household wealth",
    yUnit: "%",
    anchors: [
      { year: 1978, value: 22 },
      { year: 2000, value: 28 },
      { year: 2010, value: 30 },
      { year: 2022, value: 32 },
    ],
    yDomainMax: 40,
    sourceName: "World Inequality Database (WID.world)",
    sourceUrl: "https://wid.world/country/usa/",
    methodologyNote: "Top 1% share of net household wealth, capitalization method.",
    discontinuities:
      "WID's capitalization-based method and the Federal Reserve's survey-based Distributional Financial Accounts disagree by several points on the exact level in any given year - do not splice the two series together. https://www.federalreserve.gov/releases/efa/efa-distributional-financial-accounts.htm",
    perceptionGap:
      "UNVERIFIED BY ME, FLAG FOR HUMAN: an Ipsos 'Perils of Perception' report is real and does show Americans substantially overestimate the top 1%'s wealth share, but I could not independently confirm the exact figures. The researching agent reported 21% actual / 43% perceived (claimed to have read this from the Dec 2023 PDF directly); my own independent search instead surfaced 13% actual (per WID) / 38% perceived from what may be a different Ipsos wave or a secondary summary. The PDF is image-based and did not extract as text for me to check directly. Confirm the exact actual/perceived figures and which specific Ipsos report they come from before using this number anywhere. Candidate sources: https://www.ipsos.com/sites/default/files/ct/news/documents/2023-12/ipsos-perils-perception-prejudice-conspiracy-theories-december-2023.pdf and https://www.ipsos.com/en/perils/perils-perception-2024",
  },
  {
    slug: "ceo-to-worker-pay-ratio",
    title: "CEO-to-worker pay ratio, 1965-2023",
    questionLead: "CEO pay as a multiple of the typical worker's.",
    yLabel: "CEO compensation ÷ typical worker compensation",
    yUnit: "×",
    anchors: [
      { year: 1965, value: 21 },
      { year: 2000, value: 383 },
      { year: 2009, value: 195 },
      { year: 2023, value: 290 },
    ],
    yDomainMax: 400,
    sourceName: "Economic Policy Institute, CEO Pay data series",
    sourceUrl: "https://www.epi.org/publication/ceo-pay-in-2023/",
    methodologyNote: "Ratio of average CEO compensation (realized) to typical worker compensation, top 350 US firms.",
    discontinuities:
      "EPI reports both 'granted' compensation (options valued at grant) and 'realized' compensation (options valued when exercised), which diverge substantially - not interchangeable. 2006 SEC disclosure rule changes affect pre/post-2006 comparability.",
    perceptionGap:
      "Stanford Rock Center for Corporate Governance, 2016 nationwide survey (n=1,202): median guess for large-company CEO pay was ~$1 million; actual median was ~$10.3 million. https://www.gsb.stanford.edu/sites/gsb/files/publication-pdf/cgri-survey-2016-americans-ceo-pay.pdf",
  },
  {
    slug: "real-minimum-wage-value",
    title: "Real value of the US federal minimum wage, 1968-2025",
    questionLead: "Federal minimum wage in today's dollars.",
    yLabel: "Federal minimum wage, inflation-adjusted",
    yUnit: "2025 dollars",
    anchors: [
      { year: 1968, value: 13.7 },
      { year: 1990, value: 8.5 },
      { year: 2009, value: 10.4 },
      { year: 2025, value: 7.25 },
    ],
    yDomainMax: 15,
    sourceName: "Federal Reserve Bank of St. Louis (FRED), from BLS nominal wage and CPI data",
    sourceUrl: "https://fred.stlouisfed.org/series/FEDMINNFRWG",
    methodologyNote: "Nominal federal minimum wage divided by CPI, expressed in constant dollars.",
    discontinuities:
      "This is a derived series (nominal wage ÷ CPI), not a single official government series - exact values depend on which CPI vintage is used. Since the late 1990s a growing share of workers are covered by higher state/city minimums, so the federal figure increasingly understates the wage floor most workers actually face.",
    perceptionGap:
      "YouGov survey, published Dec 1 2022: median guess for the federal minimum wage was $9.88, versus the actual $7.25. https://today.yougov.com/politics/articles/44610-most-americans-think-minimum-wage-is-too-low",
  },
  {
    slug: "national-debt-to-gdp",
    title: "US federal debt as a share of GDP, 1974-2024",
    questionLead: "Federal debt divided by GDP.",
    yLabel: "Federal debt, % of GDP",
    yUnit: "% of GDP",
    anchors: [
      { year: 1974, value: 23 },
      { year: 2001, value: 55 },
      { year: 2007, value: 62 },
      { year: 2012, value: 100 },
      { year: 2020, value: 128 },
      { year: 2024, value: 122 },
    ],
    yDomainMax: 140,
    sourceName: "Federal Reserve Bank of St. Louis (FRED) / US Treasury",
    sourceUrl: "https://fred.stlouisfed.org/series/GFDEGDQ188S",
    methodologyNote: "Total public debt as a percentage of gross domestic product.",
    discontinuities:
      "This series is 'total public debt,' which includes intragovernmental holdings like the Social Security trust fund. 'Debt held by the public' is a separate, lower figure - do not conflate the two.",
    perceptionGap:
      "Roth, Settele & Wohlfart, Journal of Econometrics 231(1), 2022 (4,000+ US respondents): median estimate of the debt-to-GDP ratio was ~60%, versus the actual ~104% at the time of the study. https://www.sciencedirect.com/science/article/abs/pii/S0304407621000397",
  },
  {
    slug: "us-foreign-aid-share-of-budget",
    title: "US foreign aid as a share of the federal budget, 1963-2024",
    questionLead: "Foreign aid as a percent of federal spending.",
    yLabel: "Foreign aid, % of total federal outlays",
    yUnit: "% of federal budget",
    anchors: [
      { year: 1963, value: 4.7 },
      { year: 1989, value: 0.6 },
      { year: 2001, value: 0.9 },
      { year: 2024, value: 1.0 },
    ],
    yDomainMax: 5,
    sourceName: "Office of Management and Budget, Historical Tables (Table 6.1)",
    sourceUrl: "https://www.whitehouse.gov/omb/information-resources/budget/historical-tables/",
    methodologyNote: "International affairs budget function share of total federal outlays.",
    discontinuities:
      "OMB's 'international affairs' function includes more than aid narrowly defined (also embassy operations, diplomatic programs), so exact figures depend on which line items are counted in a given year.",
    perceptionGap:
      "KFF Health Tracking Poll, Feb 2025: US adults estimated foreign aid at an average of 26% of the federal budget, versus the actual ~1% - a finding KFF has tracked consistently since the 1990s. https://www.kff.org/global-health-policy/kff-health-tracking-poll-february-2025-the-publics-views-on-global-health-and-usaid/",
  },
  {
    slug: "immigrant-share-us-population",
    title: "Foreign-born share of the US population, 1970-2024",
    questionLead: "Percent of US residents born abroad.",
    yLabel: "Foreign-born residents, % of total population",
    yUnit: "%",
    anchors: [
      { year: 1970, value: 4.7 },
      { year: 2000, value: 11.1 },
      { year: 2024, value: 14.8 },
    ],
    yDomainMax: 18,
    sourceName: "Migration Policy Institute (tabulating Census Bureau/ACS data)",
    sourceUrl: "https://www.migrationpolicy.org/programs/data-hub/charts/immigrant-population-over-time",
    methodologyNote: "Foreign-born share of total US population, decennial census and American Community Survey.",
    discontinuities:
      "Methodology shifted from decennial census counts to rolling American Community Survey estimates over 2000-2010; definitions are consistent but survey mode/sampling changed.",
    perceptionGap:
      "Ipsos 'Perils of Perception' 2024 (30-country Global Advisor survey): US respondents guessed immigrants make up ~29% of the population versus the actual ~15%. https://www.ipsos.com/sites/default/files/ct/news/documents/2024-11/ipsos-the-perils-of-perception-2024.pdf",
  },
  {
    slug: "us-muslim-population-share",
    title: "Muslim share of the US population, 2007-2020",
    questionLead: "Percent of Americans who are Muslim.",
    yLabel: "US population identifying as Muslim",
    yUnit: "%",
    anchors: [
      { year: 2007, value: 0.4 },
      { year: 2010, value: 0.6 },
      { year: 2020, value: 1.1 },
    ],
    yDomainMax: 20,
    sourceName: "Pew Research Center demographic estimates",
    sourceUrl: "https://www.pewresearch.org/short-reads/2018/01/03/new-estimates-show-u-s-muslim-population-continues-to-grow/",
    methodologyNote: "Modeled estimate of the Muslim share of the US population.",
    discontinuities:
      "Pew's estimates are modeled, not from a single consistent annual census question - the Census Bureau does not ask about religion. Methodology has evolved release to release.",
    perceptionGap:
      "Ipsos 'Perils of Perception' (2016-2017 wave): average American guess for the Muslim share of the population was ~17%, roughly 17x the actual figure at the time. https://www.ipsos.com/en-us/news-polls/perils-perception-americans-fail-all-measures-perceptions-versus-facts-unique-socio-demographic",
  },
  {
    slug: "uk-greenhouse-gas-emissions",
    title: "UK greenhouse gas emissions, 1990-2025",
    questionLead: "UK annual emissions, million tonnes CO2-equivalent.",
    yLabel: "Net UK greenhouse gas emissions",
    yUnit: "million tonnes CO₂e",
    anchors: [
      { year: 1990, value: 821 },
      { year: 2015, value: 496 },
      { year: 2025, value: 367 },
    ],
    yDomainMax: 900,
    sourceName: "UK Department for Energy Security and Net Zero (DESNZ)",
    sourceUrl: "https://www.gov.uk/government/statistics/provisional-uk-greenhouse-gas-emissions-statistics-2025/2025-uk-greenhouse-gas-emissions-provisional-figures-statistical-release",
    methodologyNote: "UK net territorial greenhouse gas emissions, official statistics.",
    discontinuities:
      "Reporting methodology and emissions-factor revisions occur periodically as IPCC guidelines update. Figures for the most recent year are always provisional and later revised.",
    perceptionGap:
      "YouGov poll for the Energy & Climate Intelligence Unit, June 2026: 50% of respondents believed UK progress toward its 2050 net zero target was 'less than halfway' or 'a long way off track,' and fewer than 1 in 10 correctly identified the UK is over halfway there. https://eciu.net/media/press-releases/june-temp-record-broken-as-parliament-votes-on-climate-targets-2",
  },
  {
    slug: "us-air-pollutant-emissions",
    title: "US combined air pollutant emissions, 1970-2024",
    questionLead: "Combined national emissions of major air pollutants.",
    yLabel: "Combined criteria pollutant emissions, indexed to 1970",
    yUnit: "index (1970 = 100)",
    anchors: [
      { year: 1970, value: 100 },
      { year: 2000, value: 48 },
      { year: 2024, value: 21 },
    ],
    yDomainMax: 110,
    sourceName: "US EPA, 'Our Nation's Air' trends report",
    sourceUrl: "https://gispub.epa.gov/air/trendsreport/2025/",
    methodologyNote:
      "Combined national emissions of the six criteria pollutants (PM, SO2, NOx, VOCs, CO, lead), indexed to a 1970 baseline of 100 (a 79% cumulative decline by 2024 per EPA).",
    discontinuities:
      "Monitoring network density and methods have improved substantially since 1970, and pollutant standards have tightened over time, so 'attainment' thresholds are not static even though the emissions inventory itself is fairly continuous.",
    perceptionGap:
      "Gallup's annual environment poll, March 2026 wave: 66% of Americans say environmental quality is 'getting worse' versus 27% 'getting better,' near the record pessimism high, even as EPA-measured pollutant levels have fallen for five decades straight. https://news.gallup.com/poll/708413/americans-rating-environment-hits-new-low.aspx",
  },
  {
    slug: "us-overweight-obesity-rate",
    title: "US adult overweight/obesity rate, 1960-2023",
    questionLead: "Share of US adults (20+) who are overweight or obese, by BMI.",
    yLabel: "US adults with BMI 25 or above",
    yUnit: "%",
    anchors: [
      { year: 1960, value: 44 },
      { year: 1980, value: 47 },
      { year: 2000, value: 65 },
      { year: 2023, value: 73 },
    ],
    yDomainMax: 80,
    sourceName: "CDC/NCHS, National Health and Nutrition Examination Survey (NHANES)",
    sourceUrl: "https://www.cdc.gov/nchs/data/hestat/hestat111.htm",
    methodologyNote:
      "Measured (not self-reported) overweight-or-obese prevalence, adults 20+, NHANES physical exam data.",
    discontinuities:
      "Measurement cycles changed from single years to multi-year pooled cycles over time. Self-reported surveys (BRFSS) show notably lower rates than NHANES's measured exam data - do not mix the two series.",
    perceptionGap:
      "Ipsos Public Affairs poll, Jul 30-Aug 3 2009 (n=1,000 US adults): only 30% considered themselves 'overweight,' while CDC data for the same period put the overweight-or-obese rate at 63%. https://www.ipsos.com/en-us/only-30-us-adults-consider-themselves-overweight",
  },
  {
    slug: "us-residential-solar-cost",
    title: "Cost of installing residential solar, 2010-2023",
    questionLead: "National average unsubsidized cost to install residential solar, dollars per watt.",
    yLabel: "Installed cost per watt-DC, before incentives",
    yUnit: "$/watt",
    anchors: [
      { year: 2010, value: 7.5 },
      { year: 2016, value: 3.8 },
      { year: 2023, value: 2.8 },
    ],
    yDomainMax: 8,
    sourceName: "National Renewable Energy Laboratory (NREL), U.S. Solar PV Cost Benchmark",
    sourceUrl: "https://docs.nrel.gov/docs/fy23osti/87303.pdf",
    methodologyNote: "Bottom-up national average residential solar installation cost, before incentives.",
    discontinuities:
      "NREL revised its bottom-up benchmarking methodology at points in the series (component pricing, labor-cost modeling). Figures are national averages and vary substantially by state/incentive regime.",
    perceptionGap:
      "Harris Interactive survey for Sunrun, Feb 2012 (n=2,211 US adults, 1,475 homeowners): 97% overestimated the cost of installing solar, with 40% believing it required $20,000+ upfront. https://www.businesswire.com/news/home/20120424006063/en/Data-Shows-97-Americans-Overestimate-Cost-Installing",
  },
  {
    slug: "naep-reading-proficiency",
    title: "4th-grade reading proficiency, 1992-2024",
    questionLead: "Share of US 4th graders scoring 'proficient' or above on the national reading exam.",
    yLabel: "4th graders at or above NAEP Proficient (reading)",
    yUnit: "%",
    anchors: [
      { year: 1992, value: 29 },
      { year: 2013, value: 35 },
      { year: 2019, value: 34 },
      { year: 2024, value: 31 },
    ],
    yDomainMax: 45,
    sourceName: "National Assessment of Educational Progress (NAEP) / NCES",
    sourceUrl: "https://www.nationsreportcard.gov/reading/nation/achievement/?grade=4",
    methodologyNote: "Share of grade-4 students at or above NAEP 'Proficient' achievement level, national reading assessment.",
    discontinuities:
      "NAEP shifted some assessment frameworks and moved to digital administration in the 2019-2022 window, which NCES flags as affecting strict comparability with earlier paper-based years.",
    perceptionGap:
      "Learning Heroes national parent survey ('Parents 2016' and later waves, some with Gallup): ~90% of parents said their child was performing at or above grade level in reading, versus NAEP data showing only ~36% actually proficient. https://bealearninghero.org/research/",
  },
  {
    slug: "us-marriage-rate",
    title: "Share of US adults who are married, 1960-2023",
    questionLead: "Percent of US adults currently married.",
    yLabel: "US adults currently married",
    yUnit: "%",
    anchors: [
      { year: 1960, value: 72 },
      { year: 1990, value: 62 },
      { year: 2010, value: 52 },
      { year: 2023, value: 48 },
    ],
    yDomainMax: 80,
    sourceName: "US Census Bureau, Historical Marital Status Tables",
    sourceUrl: "https://www.census.gov/data/tables/time-series/demo/families/marital.html",
    methodologyNote: "Share of adults currently married, Census historical marital status tables.",
    discontinuities:
      "The age cutoff used for 'adults' has varied across sources (14+/15+/18+), producing slightly different baseline levels. Starting in 2019, Census estimates began including same-sex married couples.",
    perceptionGap:
      "Pew Research Center, 'The Decline of Marriage and Rise of New Families,' Nov 18 2010: only 46% of respondents correctly said the share of married adults had 'gone down' over the prior 20 years (10% said up, 20% said the same, 24% didn't know). https://www.pewresearch.org/social-trends/2010/11/18/ii-overview/",
  },
  {
    slug: "us-cancer-death-rate",
    title: "US age-adjusted cancer death rate, 1991-2016",
    questionLead: "Age-adjusted US cancer death rate.",
    yLabel: "Cancer deaths per 100,000, age-adjusted",
    yUnit: "per 100,000",
    anchors: [
      { year: 1991, value: 215 },
      { year: 2005, value: 184 },
      { year: 2016, value: 156 },
    ],
    yDomainMax: 230,
    sourceName: "CDC/NCHS, 'Health, United States' - Cancer Deaths",
    sourceUrl: "https://www.cdc.gov/nchs/hus/topics/cancer-deaths.htm",
    methodologyNote: "Age-adjusted cancer mortality rate per 100,000 population.",
    discontinuities:
      "Underlying cause-of-death coding changed from ICD-9 to ICD-10 in 1999; statisticians typically adjust for this transition when comparing across it.",
    perceptionGap:
      "WEAKER CITATION, FLAG FOR HUMAN JUDGEMENT: STAT-Harvard T.H. Chan School of Public Health poll, March 2016, found cancer widely named the most serious US health threat even as the death rate had fallen 27% since 1991 - but on treatment specifically, about two-thirds of respondents DID recognise improvement, meaning this is a partial/mixed perception gap, not a clean majority-wrong finding like the others in this file. Consider whether this one meets the bar before activating it. https://hsph.harvard.edu/wp-content/uploads/2024/10/Stat-Harvard-Poll-Mar-2016-Cancer.pdf",
  },
];

// Guarded so scripts/append-sources.ts can `import { SPECS }` from this file
// without re-running the file-writing side effects below - only runs when
// this file is executed directly.
const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  runGenerator();
}

function runGenerator(): void {
const problems: string[] = [];
let written = 0;

for (const spec of SPECS) {
  const { xValues, yValues } = interpolateAnnualSeries(spec.anchors);
  const n = xValues.length;

  if (n < 6) {
    problems.push(`${spec.slug}: only ${n} points after interpolation, too short to be worth shipping`);
    continue;
  }

  const revealFromIndex = Math.max(1, Math.min(n - 2, Math.round((n - 1) * REVEAL_FRACTION)));

  const body = `import type { Dataset } from "../types/dataset.ts";

/**
 * TODO: verify against ${spec.sourceName}.
 *
 * Generated by scripts/generate-datasets.ts from a handful of real, sourced
 * anchor points, piecewise-linearly interpolated (lib/datasets/interpolate.ts)
 * into an annual series. The endpoints and named inflection years are real;
 * everything interpolated between them is NOT - a human needs to pull the
 * exact annual series before this ships. verified stays false and isActive
 * stays false until then (see scripts/validate-datasets.ts).
 *
 * ${spec.discontinuities}
 */
export const ${toCamelCase(spec.slug)}: Dataset = {
  slug: "${spec.slug}",
  title: "${escape(spec.title)}",
  question: "${escape(`${spec.questionLead} Draw what happened after ${xValues[revealFromIndex]}.`)}",
  yLabel: "${escape(spec.yLabel)}",
  yUnit: "${escape(spec.yUnit)}",
  xValues: ${JSON.stringify(xValues)},
  yValues: ${JSON.stringify(yValues)},
  revealFromIndex: ${revealFromIndex},
  yDomain: [0, ${spec.yDomainMax}],
  sourceName: "${escape(spec.sourceName)}",
  sourceUrl: "${spec.sourceUrl}",
  verified: false,
  verifiedOn: null,
  isActive: false,
};
`;

  writeFileSync(`lib/datasets/${spec.slug}.ts`, body);
  written += 1;
}

if (problems.length > 0) {
  console.error("generate-datasets: problems:\n" + problems.map((p) => `  ${p}`).join("\n"));
}
console.log(`generate-datasets: wrote ${written} dataset file(s)`);

// --- SOURCES.md rows, printed for manual insertion -------------------------
// Not auto-appended: SOURCES.md is hand-reviewed prose, and the methodology
// section under each dataset's heading benefits from a human's eyes before
// it's treated as final. Printed here so nothing has to be retyped.

console.log("\n--- SOURCES.md rows (insert into the table + add a heading section each) ---\n");
for (const spec of SPECS) {
  console.log(
    `| \`${spec.slug}\` | ${spec.sourceName} | ${spec.sourceUrl} | not yet retrieved | **NO** | See notes |`,
  );
}
} // end runGenerator

function toCamelCase(slug: string): string {
  return slug.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
}

function escape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
