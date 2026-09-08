import type { Dataset } from "../types/dataset.ts";
import { teenBirthRate } from "./teen-birth-rate.ts";
import { usViolentCrimeRate } from "./us-violent-crime-rate.ts";
import { usGunHomicideRate } from "./us-gun-homicide-rate.ts";
import { usLifeExpectancy } from "./us-life-expectancy.ts";
import { usDrugOverdoseDeaths } from "./us-drug-overdose-deaths.ts";
import { globalChildVaccinationRate } from "./global-child-vaccination-rate.ts";
import { usOfficialPovertyRate } from "./us-official-poverty-rate.ts";
import { top1PercentWealthShare } from "./top-1-percent-wealth-share.ts";
import { ceoToWorkerPayRatio } from "./ceo-to-worker-pay-ratio.ts";
import { realMinimumWageValue } from "./real-minimum-wage-value.ts";
import { nationalDebtToGdp } from "./national-debt-to-gdp.ts";
import { usForeignAidShareOfBudget } from "./us-foreign-aid-share-of-budget.ts";
import { immigrantShareUsPopulation } from "./immigrant-share-us-population.ts";
import { usMuslimPopulationShare } from "./us-muslim-population-share.ts";
import { ukGreenhouseGasEmissions } from "./uk-greenhouse-gas-emissions.ts";
import { usAirPollutantEmissions } from "./us-air-pollutant-emissions.ts";
import { usOverweightObesityRate } from "./us-overweight-obesity-rate.ts";
import { usResidentialSolarCost } from "./us-residential-solar-cost.ts";
import { naepReadingProficiency } from "./naep-reading-proficiency.ts";
import { usMarriageRate } from "./us-marriage-rate.ts";
import { usCancerDeathRate } from "./us-cancer-death-rate.ts";

import { generatedDatasets } from "./generated/index.ts";

/**
 * The hand-authored datasets. Their provenance is a reviewed row in
 * data/SOURCES.md, and their values are interpolations between anchor
 * points - which is why every one of them is rated red.
 */
export const curatedDatasets: Dataset[] = [
  teenBirthRate,
  usViolentCrimeRate,
  usGunHomicideRate,
  usLifeExpectancy,
  usDrugOverdoseDeaths,
  globalChildVaccinationRate,
  usOfficialPovertyRate,
  top1PercentWealthShare,
  ceoToWorkerPayRatio,
  realMinimumWageValue,
  nationalDebtToGdp,
  usForeignAidShareOfBudget,
  immigrantShareUsPopulation,
  usMuslimPopulationShare,
  ukGreenhouseGasEmissions,
  usAirPollutantEmissions,
  usOverweightObesityRate,
  usResidentialSolarCost,
  naepReadingProficiency,
  usMarriageRate,
  usCancerDeathRate,
];

/**
 * Every dataset in the repo, curated and imported alike. The validator checks
 * all of these, applying the provenance rule appropriate to each.
 */
export const allDatasets: Dataset[] = [...curatedDatasets, ...generatedDatasets];

/** The datasets players are allowed to see. */
export const activeDatasets: Dataset[] = allDatasets.filter((d) => d.isActive);

export function datasetBySlug(slug: string): Dataset | undefined {
  return allDatasets.find((d) => d.slug === slug);
}
