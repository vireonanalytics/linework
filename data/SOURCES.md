# Sources

One row per dataset. This file is the paper trail: if a number is on screen,
its provenance is here.

A dataset cannot be marked `verified: true` until a human has opened the source
URL, pulled the series, and checked it value by value against
`lib/datasets/<slug>.ts`. `scripts/validate-datasets.ts` refuses to let an
unverified dataset be served (`isActive: true`) in a production build.

| Slug | Source organization | Direct download URL | Retrieved | Verified | Known discontinuities |
|---|---|---|---|---|---|
| `us-teen-birth-rate` | CDC / National Center for Health Statistics (NCHS), Natality files | https://wonder.cdc.gov/natality.html | not yet retrieved | **NO** | See notes below |
| `us-overweight-obesity-rate` | CDC/NCHS, National Health and Nutrition Examination Survey (NHANES) | https://www.cdc.gov/nchs/data/hestat/hestat111.htm | not yet retrieved | **NO** | See notes below |
| `us-residential-solar-cost` | National Renewable Energy Laboratory (NREL), U.S. Solar PV Cost Benchmark | https://docs.nrel.gov/docs/fy23osti/87303.pdf | not yet retrieved | **NO** | See notes below |
| `naep-reading-proficiency` | National Assessment of Educational Progress (NAEP) / NCES | https://www.nationsreportcard.gov/reading/nation/achievement/?grade=4 | not yet retrieved | **NO** | See notes below |
| `us-marriage-rate` | US Census Bureau, Historical Marital Status Tables | https://www.census.gov/data/tables/time-series/demo/families/marital.html | not yet retrieved | **NO** | See notes below |
| `us-cancer-death-rate` | CDC/NCHS, 'Health, United States' - Cancer Deaths | https://www.cdc.gov/nchs/hus/topics/cancer-deaths.htm | not yet retrieved | **NO** | See notes below |
| `us-violent-crime-rate` | FBI Uniform Crime Reporting Program / Crime Data Explorer | https://cde.ucr.cjis.gov/LATEST/webapp/#/pages/explorer/crime/crime-trend | not yet retrieved | **NO** | See notes below |
| `us-gun-homicide-rate` | CDC WISQARS / CDC WONDER Underlying Cause of Death | https://wisqars.cdc.gov/ | not yet retrieved | **NO** | See notes below |
| `us-life-expectancy` | CDC/NCHS National Vital Statistics System | https://www.cdc.gov/nchs/nvss/mortality_historical_data.htm | not yet retrieved | **NO** | See notes below |
| `us-drug-overdose-deaths` | CDC/NCHS Vital Statistics Rapid Release, Provisional Drug Overdose Data | https://www.cdc.gov/nchs/nvss/vsrr/drug-overdose-data.htm | not yet retrieved | **NO** | See notes below |
| `global-child-vaccination-rate` | WHO/UNICEF Estimates of National Immunization Coverage (WUENIC) | https://data.who.int/indicators/i/48D7D19/F8E084C | not yet retrieved | **NO** | See notes below |
| `us-official-poverty-rate` | US Census Bureau, Historical Poverty Tables | https://www.census.gov/data/tables/time-series/demo/income-poverty/historical-poverty-people.html | not yet retrieved | **NO** | See notes below |
| `top-1-percent-wealth-share` | World Inequality Database (WID.world) | https://wid.world/country/usa/ | not yet retrieved | **NO** | See notes below |
| `ceo-to-worker-pay-ratio` | Economic Policy Institute, CEO Pay data series | https://www.epi.org/publication/ceo-pay-in-2023/ | not yet retrieved | **NO** | See notes below |
| `real-minimum-wage-value` | Federal Reserve Bank of St. Louis (FRED), from BLS nominal wage and CPI data | https://fred.stlouisfed.org/series/FEDMINNFRWG | not yet retrieved | **NO** | See notes below |
| `national-debt-to-gdp` | Federal Reserve Bank of St. Louis (FRED) / US Treasury | https://fred.stlouisfed.org/series/GFDEGDQ188S | not yet retrieved | **NO** | See notes below |
| `us-foreign-aid-share-of-budget` | Office of Management and Budget, Historical Tables (Table 6.1) | https://www.whitehouse.gov/omb/information-resources/budget/historical-tables/ | not yet retrieved | **NO** | See notes below |
| `immigrant-share-us-population` | Migration Policy Institute (tabulating Census Bureau/ACS data) | https://www.migrationpolicy.org/programs/data-hub/charts/immigrant-population-over-time | not yet retrieved | **NO** | See notes below |
| `us-muslim-population-share` | Pew Research Center demographic estimates | https://www.pewresearch.org/short-reads/2018/01/03/new-estimates-show-u-s-muslim-population-continues-to-grow/ | not yet retrieved | **NO** | See notes below |
| `uk-greenhouse-gas-emissions` | UK Department for Energy Security and Net Zero (DESNZ) | https://www.gov.uk/government/statistics/provisional-uk-greenhouse-gas-emissions-statistics-2025/2025-uk-greenhouse-gas-emissions-provisional-figures-statistical-release | not yet retrieved | **NO** | See notes below |
| `us-air-pollutant-emissions` | US EPA, 'Our Nation's Air' trends report | https://gispub.epa.gov/air/trendsreport/2025/ | not yet retrieved | **NO** | See notes below |

---

## `us-teen-birth-rate`

**Status: UNVERIFIED. Do not publish, do not quote, do not activate.**

US teen birth rate, ages 15-19, births per 1,000 women, 1991-2023.

The values currently in `lib/datasets/teen-birth-rate.ts` are an *approximation*
of the NCHS curve. They carry the correct shape, correct endpoints (roughly 61.8
in 1991 and 13.2 in 2023), and the real 2006-2007 interruption in the decline.
Individual mid-series values are not precise and must not be cited.

**What is needed to verify:** the exact annual series from CDC WONDER Natality,
rate per 1,000 female population aged 15-19, single-year age group 15-19,
1991-2023. A human is pulling this.

**Known discontinuities to check when the real series arrives:**

- **Population denominators were rebased after each decennial census.** Rates
  for intercensal years get revised once new census-based population estimates
  land, so a series pulled today may not match a series pulled in 2015 for the
  same years. Record which vintage of population estimates the pull used.
- **1991-2002 vs 2003 onwards.** The US Standard Certificate of Live Birth was
  revised in 2003 and states adopted it on a rolling schedule through 2016.
  This mostly affects derived fields rather than maternal age, but the break
  should be noted.
- **WONDER splits its natality data across several files** with different year
  ranges. Confirm the whole 1991-2023 span comes from a consistent measure
  rather than being stitched across incompatible releases.
- **2020 is a pandemic year.** The dip is real, not an artifact, but it sits on
  top of a broader fertility decline that year.

**Once verified:** set `verified: true`, set `verifiedOn` to the ISO date,
set `isActive: true`, fill in the retrieval date above, and remove the
`TODO: verify against NCHS` comment from the dataset file.

---

## `us-violent-crime-rate`

**Status: UNVERIFIED. Do not publish, do not quote, do not activate.**

Series generated by `scripts/generate-datasets.ts` from real, sourced anchor
points (real years, real approximate values) at 1991, 1999, 2009, 2015, 2020, 2023, connected by straight lines. Everything between those anchor years
is an interpolation guess, not a measured value - a human needs to pull the
exact annual series (1991-2023) before this
ships.

**What is needed to verify:** the exact annual series from FBI Uniform Crime Reporting Program / Crime Data Explorer,
National violent crime rate per 100,000 population, from FBI-collected agency reports.

**Known discontinuities to check when the real series arrives:**

FBI transitioned agencies from the old Summary Reporting System (SRS) to incident-based NIBRS around 2021; many agencies did not report that year, making 2021 figures less reliable/comparable than surrounding years. The Bureau of Justice Statistics' NCVS victimization survey sometimes shows a different picture in the same year and is not the same series.

**The perception-gap claim behind this dataset:** Gallup's annual Crime poll: in most years since 1993 (commonly 60-80% of respondents, e.g. 77% in Nov 2023), a majority say crime is up nationally from the prior year, even in years UCR data shows clear declines. https://news.gallup.com/poll/1603/crime.aspx

**Once verified:** set `verified: true`, set `verifiedOn` to the ISO date,
set `isActive: true`, fill in the retrieval date above, and remove the
`TODO: verify against` comment from the dataset file.

---

## `us-gun-homicide-rate`

**Status: UNVERIFIED. Do not publish, do not quote, do not activate.**

Series generated by `scripts/generate-datasets.ts` from real, sourced anchor
points (real years, real approximate values) at 1993, 2000, 2010, 2020, 2021, 2024, connected by straight lines. Everything between those anchor years
is an interpolation guess, not a measured value - a human needs to pull the
exact annual series (1993-2024) before this
ships.

**What is needed to verify:** the exact annual series from CDC WISQARS / CDC WONDER Underlying Cause of Death,
Firearm homicide deaths per 100,000 population, CDC mortality data.

**Known discontinuities to check when the real series arrives:**

Gun suicides moved in the opposite direction over the same period (rising to record highs) - 'gun deaths' overall vs. 'gun homicides' specifically are very different series; be precise about which one is shown.

**The perception-gap claim behind this dataset:** Pew Research Center, 'Gun Homicide Rate Down 49% Since 1993 Peak; Public Unaware' (May 7, 2013) - confirmed directly: rate fell from 7.0 (1993) to 3.6 per 100,000 (2010), but 56% of Americans believed gun crime was higher than 20 years earlier and only 12% said lower. https://www.pewresearch.org/social-trends/2013/05/07/gun-homicide-rate-down-49-since-1993-peak-public-unaware/

**Once verified:** set `verified: true`, set `verifiedOn` to the ISO date,
set `isActive: true`, fill in the retrieval date above, and remove the
`TODO: verify against` comment from the dataset file.

---

## `us-life-expectancy`

**Status: UNVERIFIED. Do not publish, do not quote, do not activate.**

Series generated by `scripts/generate-datasets.ts` from real, sourced anchor
points (real years, real approximate values) at 1990, 2010, 2019, 2021, 2023, connected by straight lines. Everything between those anchor years
is an interpolation guess, not a measured value - a human needs to pull the
exact annual series (1990-2023) before this
ships.

**What is needed to verify:** the exact annual series from CDC/NCHS National Vital Statistics System,
Period life expectancy at birth, all races/sexes combined.

**Known discontinuities to check when the real series arrives:**

COVID-era provisional figures for 2020-2021 were revised somewhat after initial release. Methodology and cause-of-death coding are otherwise broadly consistent across the period.

**The perception-gap claim behind this dataset:** YouGov survey, Sept 12-15 2022 (n=1,000 US adults): only 24% accurately placed US life expectancy in the 75-79 range; 31% guessed too high. https://yougov.com/en-us/articles/44154-what-do-americans-know-about-life-expectancy

**Once verified:** set `verified: true`, set `verifiedOn` to the ISO date,
set `isActive: true`, fill in the retrieval date above, and remove the
`TODO: verify against` comment from the dataset file.

---

## `us-drug-overdose-deaths`

**Status: UNVERIFIED. Do not publish, do not quote, do not activate.**

Series generated by `scripts/generate-datasets.ts` from real, sourced anchor
points (real years, real approximate values) at 1999, 2013, 2021, 2023, 2024, connected by straight lines. Everything between those anchor years
is an interpolation guess, not a measured value - a human needs to pull the
exact annual series (1999-2024) before this
ships.

**What is needed to verify:** the exact annual series from CDC/NCHS Vital Statistics Rapid Release, Provisional Drug Overdose Data,
Provisional and final annual drug overdose death rate per 100,000.

**Known discontinuities to check when the real series arrives:**

Cause-of-death coding for specific drug categories has been revised multiple times; a meaningful share of death certificates historically lacked a specified drug (varies by state/year). Provisional counts are later revised upward as lagging reports arrive.

**The perception-gap claim behind this dataset:** Pew Research Center, May 31 2022: public concern about drug addiction fell from 42% (2018) to 35% (2021) even as overdose deaths rose from ~70,000 to ~92,000 over the same window - and fell more in the counties hit hardest. https://www.pewresearch.org/short-reads/2022/05/31/concern-about-drug-addiction-has-declined-in-u-s-even-in-areas-where-fatal-overdoses-have-risen-the-most/

**Once verified:** set `verified: true`, set `verifiedOn` to the ISO date,
set `isActive: true`, fill in the retrieval date above, and remove the
`TODO: verify against` comment from the dataset file.

---

## `global-child-vaccination-rate`

**Status: UNVERIFIED. Do not publish, do not quote, do not activate.**

Series generated by `scripts/generate-datasets.ts` from real, sourced anchor
points (real years, real approximate values) at 1980, 2000, 2019, 2021, 2023, connected by straight lines. Everything between those anchor years
is an interpolation guess, not a measured value - a human needs to pull the
exact annual series (1980-2023) before this
ships.

**What is needed to verify:** the exact annual series from WHO/UNICEF Estimates of National Immunization Coverage (WUENIC),
Modeled national immunization coverage estimates, WHO/UNICEF joint reporting.

**Known discontinuities to check when the real series arrives:**

WUENIC estimates are periodically revised retroactively as countries submit better data; the specific antigen tracked (e.g. DTP3 vs. 'at least one vaccine') changes the exact curve.

**The perception-gap claim behind this dataset:** Ipsos/Gapminder 'Mind the Gap' survey, 2017 (~12,000 respondents, 14 countries): only 13% correctly answered that ~88% of the world's 1-year-olds are vaccinated against some disease; 43% guessed only ~20%. https://www.gapminder.org/questions/gms1-9/

**Once verified:** set `verified: true`, set `verifiedOn` to the ISO date,
set `isActive: true`, fill in the retrieval date above, and remove the
`TODO: verify against` comment from the dataset file.

---

## `us-official-poverty-rate`

**Status: UNVERIFIED. Do not publish, do not quote, do not activate.**

Series generated by `scripts/generate-datasets.ts` from real, sourced anchor
points (real years, real approximate values) at 1959, 1973, 2000, 2010, 2023, connected by straight lines. Everything between those anchor years
is an interpolation guess, not a measured value - a human needs to pull the
exact annual series (1959-2023) before this
ships.

**What is needed to verify:** the exact annual series from US Census Bureau, Historical Poverty Tables,
Official poverty rate, Current Population Survey Annual Social and Economic Supplement.

**Known discontinuities to check when the real series arrives:**

2013 CPS ASEC redesign changed the income questions used to compute the rate. The Supplemental Poverty Measure (SPM), introduced 2011, is a separate, non-comparable series often confused with the official rate.

**The perception-gap claim behind this dataset:** Barna Group national phone survey, Jan 2007 (n=1,003): average guess for the poverty rate was 30%, versus the 12-15% range federal statistics had shown for the prior 40 years. https://www.barna.com/research/americans-are-misinformed-about-poverty-but-widely-involved-in-helping-the-poor/

**Once verified:** set `verified: true`, set `verifiedOn` to the ISO date,
set `isActive: true`, fill in the retrieval date above, and remove the
`TODO: verify against` comment from the dataset file.

---

## `top-1-percent-wealth-share`

**Status: UNVERIFIED. Do not publish, do not quote, do not activate.**

Series generated by `scripts/generate-datasets.ts` from real, sourced anchor
points (real years, real approximate values) at 1978, 2000, 2010, 2022, connected by straight lines. Everything between those anchor years
is an interpolation guess, not a measured value - a human needs to pull the
exact annual series (1978-2022) before this
ships.

**What is needed to verify:** the exact annual series from World Inequality Database (WID.world),
Top 1% share of net household wealth, capitalization method.

**Known discontinuities to check when the real series arrives:**

WID's capitalization-based method and the Federal Reserve's survey-based Distributional Financial Accounts disagree by several points on the exact level in any given year - do not splice the two series together. https://www.federalreserve.gov/releases/efa/efa-distributional-financial-accounts.htm

**The perception-gap claim behind this dataset:** UNVERIFIED BY ME, FLAG FOR HUMAN: an Ipsos 'Perils of Perception' report is real and does show Americans substantially overestimate the top 1%'s wealth share, but I could not independently confirm the exact figures. The researching agent reported 21% actual / 43% perceived (claimed to have read this from the Dec 2023 PDF directly); my own independent search instead surfaced 13% actual (per WID) / 38% perceived from what may be a different Ipsos wave or a secondary summary. The PDF is image-based and did not extract as text for me to check directly. Confirm the exact actual/perceived figures and which specific Ipsos report they come from before using this number anywhere. Candidate sources: https://www.ipsos.com/sites/default/files/ct/news/documents/2023-12/ipsos-perils-perception-prejudice-conspiracy-theories-december-2023.pdf and https://www.ipsos.com/en/perils/perils-perception-2024

**Once verified:** set `verified: true`, set `verifiedOn` to the ISO date,
set `isActive: true`, fill in the retrieval date above, and remove the
`TODO: verify against` comment from the dataset file.

---

## `ceo-to-worker-pay-ratio`

**Status: UNVERIFIED. Do not publish, do not quote, do not activate.**

Series generated by `scripts/generate-datasets.ts` from real, sourced anchor
points (real years, real approximate values) at 1965, 2000, 2009, 2023, connected by straight lines. Everything between those anchor years
is an interpolation guess, not a measured value - a human needs to pull the
exact annual series (1965-2023) before this
ships.

**What is needed to verify:** the exact annual series from Economic Policy Institute, CEO Pay data series,
Ratio of average CEO compensation (realized) to typical worker compensation, top 350 US firms.

**Known discontinuities to check when the real series arrives:**

EPI reports both 'granted' compensation (options valued at grant) and 'realized' compensation (options valued when exercised), which diverge substantially - not interchangeable. 2006 SEC disclosure rule changes affect pre/post-2006 comparability.

**The perception-gap claim behind this dataset:** Stanford Rock Center for Corporate Governance, 2016 nationwide survey (n=1,202): median guess for large-company CEO pay was ~$1 million; actual median was ~$10.3 million. https://www.gsb.stanford.edu/sites/gsb/files/publication-pdf/cgri-survey-2016-americans-ceo-pay.pdf

**Once verified:** set `verified: true`, set `verifiedOn` to the ISO date,
set `isActive: true`, fill in the retrieval date above, and remove the
`TODO: verify against` comment from the dataset file.

---

## `real-minimum-wage-value`

**Status: UNVERIFIED. Do not publish, do not quote, do not activate.**

Series generated by `scripts/generate-datasets.ts` from real, sourced anchor
points (real years, real approximate values) at 1968, 1990, 2009, 2025, connected by straight lines. Everything between those anchor years
is an interpolation guess, not a measured value - a human needs to pull the
exact annual series (1968-2025) before this
ships.

**What is needed to verify:** the exact annual series from Federal Reserve Bank of St. Louis (FRED), from BLS nominal wage and CPI data,
Nominal federal minimum wage divided by CPI, expressed in constant dollars.

**Known discontinuities to check when the real series arrives:**

This is a derived series (nominal wage ÷ CPI), not a single official government series - exact values depend on which CPI vintage is used. Since the late 1990s a growing share of workers are covered by higher state/city minimums, so the federal figure increasingly understates the wage floor most workers actually face.

**The perception-gap claim behind this dataset:** YouGov survey, published Dec 1 2022: median guess for the federal minimum wage was $9.88, versus the actual $7.25. https://today.yougov.com/politics/articles/44610-most-americans-think-minimum-wage-is-too-low

**Once verified:** set `verified: true`, set `verifiedOn` to the ISO date,
set `isActive: true`, fill in the retrieval date above, and remove the
`TODO: verify against` comment from the dataset file.

---

## `national-debt-to-gdp`

**Status: UNVERIFIED. Do not publish, do not quote, do not activate.**

Series generated by `scripts/generate-datasets.ts` from real, sourced anchor
points (real years, real approximate values) at 1974, 2001, 2007, 2012, 2020, 2024, connected by straight lines. Everything between those anchor years
is an interpolation guess, not a measured value - a human needs to pull the
exact annual series (1974-2024) before this
ships.

**What is needed to verify:** the exact annual series from Federal Reserve Bank of St. Louis (FRED) / US Treasury,
Total public debt as a percentage of gross domestic product.

**Known discontinuities to check when the real series arrives:**

This series is 'total public debt,' which includes intragovernmental holdings like the Social Security trust fund. 'Debt held by the public' is a separate, lower figure - do not conflate the two.

**The perception-gap claim behind this dataset:** Roth, Settele & Wohlfart, Journal of Econometrics 231(1), 2022 (4,000+ US respondents): median estimate of the debt-to-GDP ratio was ~60%, versus the actual ~104% at the time of the study. https://www.sciencedirect.com/science/article/abs/pii/S0304407621000397

**Once verified:** set `verified: true`, set `verifiedOn` to the ISO date,
set `isActive: true`, fill in the retrieval date above, and remove the
`TODO: verify against` comment from the dataset file.

---

## `us-foreign-aid-share-of-budget`

**Status: UNVERIFIED. Do not publish, do not quote, do not activate.**

Series generated by `scripts/generate-datasets.ts` from real, sourced anchor
points (real years, real approximate values) at 1963, 1989, 2001, 2024, connected by straight lines. Everything between those anchor years
is an interpolation guess, not a measured value - a human needs to pull the
exact annual series (1963-2024) before this
ships.

**What is needed to verify:** the exact annual series from Office of Management and Budget, Historical Tables (Table 6.1),
International affairs budget function share of total federal outlays.

**Known discontinuities to check when the real series arrives:**

OMB's 'international affairs' function includes more than aid narrowly defined (also embassy operations, diplomatic programs), so exact figures depend on which line items are counted in a given year.

**The perception-gap claim behind this dataset:** KFF Health Tracking Poll, Feb 2025: US adults estimated foreign aid at an average of 26% of the federal budget, versus the actual ~1% - a finding KFF has tracked consistently since the 1990s. https://www.kff.org/global-health-policy/kff-health-tracking-poll-february-2025-the-publics-views-on-global-health-and-usaid/

**Once verified:** set `verified: true`, set `verifiedOn` to the ISO date,
set `isActive: true`, fill in the retrieval date above, and remove the
`TODO: verify against` comment from the dataset file.

---

## `immigrant-share-us-population`

**Status: UNVERIFIED. Do not publish, do not quote, do not activate.**

Series generated by `scripts/generate-datasets.ts` from real, sourced anchor
points (real years, real approximate values) at 1970, 2000, 2024, connected by straight lines. Everything between those anchor years
is an interpolation guess, not a measured value - a human needs to pull the
exact annual series (1970-2024) before this
ships.

**What is needed to verify:** the exact annual series from Migration Policy Institute (tabulating Census Bureau/ACS data),
Foreign-born share of total US population, decennial census and American Community Survey.

**Known discontinuities to check when the real series arrives:**

Methodology shifted from decennial census counts to rolling American Community Survey estimates over 2000-2010; definitions are consistent but survey mode/sampling changed.

**The perception-gap claim behind this dataset:** Ipsos 'Perils of Perception' 2024 (30-country Global Advisor survey): US respondents guessed immigrants make up ~29% of the population versus the actual ~15%. https://www.ipsos.com/sites/default/files/ct/news/documents/2024-11/ipsos-the-perils-of-perception-2024.pdf

**Once verified:** set `verified: true`, set `verifiedOn` to the ISO date,
set `isActive: true`, fill in the retrieval date above, and remove the
`TODO: verify against` comment from the dataset file.

---

## `us-muslim-population-share`

**Status: UNVERIFIED. Do not publish, do not quote, do not activate.**

Series generated by `scripts/generate-datasets.ts` from real, sourced anchor
points (real years, real approximate values) at 2007, 2010, 2020, connected by straight lines. Everything between those anchor years
is an interpolation guess, not a measured value - a human needs to pull the
exact annual series (2007-2020) before this
ships.

**What is needed to verify:** the exact annual series from Pew Research Center demographic estimates,
Modeled estimate of the Muslim share of the US population.

**Known discontinuities to check when the real series arrives:**

Pew's estimates are modeled, not from a single consistent annual census question - the Census Bureau does not ask about religion. Methodology has evolved release to release.

**The perception-gap claim behind this dataset:** Ipsos 'Perils of Perception' (2016-2017 wave): average American guess for the Muslim share of the population was ~17%, roughly 17x the actual figure at the time. https://www.ipsos.com/en-us/news-polls/perils-perception-americans-fail-all-measures-perceptions-versus-facts-unique-socio-demographic

**Once verified:** set `verified: true`, set `verifiedOn` to the ISO date,
set `isActive: true`, fill in the retrieval date above, and remove the
`TODO: verify against` comment from the dataset file.

---

## `uk-greenhouse-gas-emissions`

**Status: UNVERIFIED. Do not publish, do not quote, do not activate.**

Series generated by `scripts/generate-datasets.ts` from real, sourced anchor
points (real years, real approximate values) at 1990, 2015, 2025, connected by straight lines. Everything between those anchor years
is an interpolation guess, not a measured value - a human needs to pull the
exact annual series (1990-2025) before this
ships.

**What is needed to verify:** the exact annual series from UK Department for Energy Security and Net Zero (DESNZ),
UK net territorial greenhouse gas emissions, official statistics.

**Known discontinuities to check when the real series arrives:**

Reporting methodology and emissions-factor revisions occur periodically as IPCC guidelines update. Figures for the most recent year are always provisional and later revised.

**The perception-gap claim behind this dataset:** YouGov poll for the Energy & Climate Intelligence Unit, June 2026: 50% of respondents believed UK progress toward its 2050 net zero target was 'less than halfway' or 'a long way off track,' and fewer than 1 in 10 correctly identified the UK is over halfway there. https://eciu.net/media/press-releases/june-temp-record-broken-as-parliament-votes-on-climate-targets-2

**Once verified:** set `verified: true`, set `verifiedOn` to the ISO date,
set `isActive: true`, fill in the retrieval date above, and remove the
`TODO: verify against` comment from the dataset file.

---

## `us-air-pollutant-emissions`

**Status: UNVERIFIED. Do not publish, do not quote, do not activate.**

Series generated by `scripts/generate-datasets.ts` from real, sourced anchor
points (real years, real approximate values) at 1970, 2000, 2024, connected by straight lines. Everything between those anchor years
is an interpolation guess, not a measured value - a human needs to pull the
exact annual series (1970-2024) before this
ships.

**What is needed to verify:** the exact annual series from US EPA, 'Our Nation's Air' trends report,
Combined national emissions of the six criteria pollutants (PM, SO2, NOx, VOCs, CO, lead), indexed to a 1970 baseline of 100 (a 79% cumulative decline by 2024 per EPA).

**Known discontinuities to check when the real series arrives:**

Monitoring network density and methods have improved substantially since 1970, and pollutant standards have tightened over time, so 'attainment' thresholds are not static even though the emissions inventory itself is fairly continuous.

**The perception-gap claim behind this dataset:** Gallup's annual environment poll, March 2026 wave: 66% of Americans say environmental quality is 'getting worse' versus 27% 'getting better,' near the record pessimism high, even as EPA-measured pollutant levels have fallen for five decades straight. https://news.gallup.com/poll/708413/americans-rating-environment-hits-new-low.aspx

**Once verified:** set `verified: true`, set `verifiedOn` to the ISO date,
set `isActive: true`, fill in the retrieval date above, and remove the
`TODO: verify against` comment from the dataset file.

---

## `us-overweight-obesity-rate`

**Status: UNVERIFIED. Do not publish, do not quote, do not activate.**

Series generated by `scripts/generate-datasets.ts` from real, sourced anchor
points (real years, real approximate values) at 1960, 1980, 2000, 2023, connected by straight lines. Everything between those anchor years
is an interpolation guess, not a measured value - a human needs to pull the
exact annual series (1960-2023) before this
ships.

**What is needed to verify:** the exact annual series from CDC/NCHS, National Health and Nutrition Examination Survey (NHANES),
Measured (not self-reported) overweight-or-obese prevalence, adults 20+, NHANES physical exam data.

**Known discontinuities to check when the real series arrives:**

Measurement cycles changed from single years to multi-year pooled cycles over time. Self-reported surveys (BRFSS) show notably lower rates than NHANES's measured exam data - do not mix the two series.

**The perception-gap claim behind this dataset:** Ipsos Public Affairs poll, Jul 30-Aug 3 2009 (n=1,000 US adults): only 30% considered themselves 'overweight,' while CDC data for the same period put the overweight-or-obese rate at 63%. https://www.ipsos.com/en-us/only-30-us-adults-consider-themselves-overweight

**Once verified:** set `verified: true`, set `verifiedOn` to the ISO date,
set `isActive: true`, fill in the retrieval date above, and remove the
`TODO: verify against` comment from the dataset file.

---

## `us-residential-solar-cost`

**Status: UNVERIFIED. Do not publish, do not quote, do not activate.**

Series generated by `scripts/generate-datasets.ts` from real, sourced anchor
points (real years, real approximate values) at 2010, 2016, 2023, connected by straight lines. Everything between those anchor years
is an interpolation guess, not a measured value - a human needs to pull the
exact annual series (2010-2023) before this
ships.

**What is needed to verify:** the exact annual series from National Renewable Energy Laboratory (NREL), U.S. Solar PV Cost Benchmark,
Bottom-up national average residential solar installation cost, before incentives.

**Known discontinuities to check when the real series arrives:**

NREL revised its bottom-up benchmarking methodology at points in the series (component pricing, labor-cost modeling). Figures are national averages and vary substantially by state/incentive regime.

**The perception-gap claim behind this dataset:** Harris Interactive survey for Sunrun, Feb 2012 (n=2,211 US adults, 1,475 homeowners): 97% overestimated the cost of installing solar, with 40% believing it required $20,000+ upfront. https://www.businesswire.com/news/home/20120424006063/en/Data-Shows-97-Americans-Overestimate-Cost-Installing

**Once verified:** set `verified: true`, set `verifiedOn` to the ISO date,
set `isActive: true`, fill in the retrieval date above, and remove the
`TODO: verify against` comment from the dataset file.

---

## `naep-reading-proficiency`

**Status: UNVERIFIED. Do not publish, do not quote, do not activate.**

Series generated by `scripts/generate-datasets.ts` from real, sourced anchor
points (real years, real approximate values) at 1992, 2013, 2019, 2024, connected by straight lines. Everything between those anchor years
is an interpolation guess, not a measured value - a human needs to pull the
exact annual series (1992-2024) before this
ships.

**What is needed to verify:** the exact annual series from National Assessment of Educational Progress (NAEP) / NCES,
Share of grade-4 students at or above NAEP 'Proficient' achievement level, national reading assessment.

**Known discontinuities to check when the real series arrives:**

NAEP shifted some assessment frameworks and moved to digital administration in the 2019-2022 window, which NCES flags as affecting strict comparability with earlier paper-based years.

**The perception-gap claim behind this dataset:** Learning Heroes national parent survey ('Parents 2016' and later waves, some with Gallup): ~90% of parents said their child was performing at or above grade level in reading, versus NAEP data showing only ~36% actually proficient. https://bealearninghero.org/research/

**Once verified:** set `verified: true`, set `verifiedOn` to the ISO date,
set `isActive: true`, fill in the retrieval date above, and remove the
`TODO: verify against` comment from the dataset file.

---

## `us-marriage-rate`

**Status: UNVERIFIED. Do not publish, do not quote, do not activate.**

Series generated by `scripts/generate-datasets.ts` from real, sourced anchor
points (real years, real approximate values) at 1960, 1990, 2010, 2023, connected by straight lines. Everything between those anchor years
is an interpolation guess, not a measured value - a human needs to pull the
exact annual series (1960-2023) before this
ships.

**What is needed to verify:** the exact annual series from US Census Bureau, Historical Marital Status Tables,
Share of adults currently married, Census historical marital status tables.

**Known discontinuities to check when the real series arrives:**

The age cutoff used for 'adults' has varied across sources (14+/15+/18+), producing slightly different baseline levels. Starting in 2019, Census estimates began including same-sex married couples.

**The perception-gap claim behind this dataset:** Pew Research Center, 'The Decline of Marriage and Rise of New Families,' Nov 18 2010: only 46% of respondents correctly said the share of married adults had 'gone down' over the prior 20 years (10% said up, 20% said the same, 24% didn't know). https://www.pewresearch.org/social-trends/2010/11/18/ii-overview/

**Once verified:** set `verified: true`, set `verifiedOn` to the ISO date,
set `isActive: true`, fill in the retrieval date above, and remove the
`TODO: verify against` comment from the dataset file.

---

## `us-cancer-death-rate`

**Status: UNVERIFIED. Do not publish, do not quote, do not activate.**

Series generated by `scripts/generate-datasets.ts` from real, sourced anchor
points (real years, real approximate values) at 1991, 2005, 2016, connected by straight lines. Everything between those anchor years
is an interpolation guess, not a measured value - a human needs to pull the
exact annual series (1991-2016) before this
ships.

**What is needed to verify:** the exact annual series from CDC/NCHS, 'Health, United States' - Cancer Deaths,
Age-adjusted cancer mortality rate per 100,000 population.

**Known discontinuities to check when the real series arrives:**

Underlying cause-of-death coding changed from ICD-9 to ICD-10 in 1999; statisticians typically adjust for this transition when comparing across it.

**The perception-gap claim behind this dataset:** WEAKER CITATION, FLAG FOR HUMAN JUDGEMENT: STAT-Harvard T.H. Chan School of Public Health poll, March 2016, found cancer widely named the most serious US health threat even as the death rate had fallen 27% since 1991 - but on treatment specifically, about two-thirds of respondents DID recognise improvement, meaning this is a partial/mixed perception gap, not a clean majority-wrong finding like the others in this file. Consider whether this one meets the bar before activating it. https://hsph.harvard.edu/wp-content/uploads/2024/10/Stat-Harvard-Poll-Mar-2016-Cancer.pdf

**Once verified:** set `verified: true`, set `verifiedOn` to the ISO date,
set `isActive: true`, fill in the retrieval date above, and remove the
`TODO: verify against` comment from the dataset file.
