import { String as EString } from "effect";

export const GENERAL_DATA_URL = new URL(
  "https://2025electionresults.comelec.gov.ph/data/regions/local/",
);
export const PRECINCT_DATA_URL = new URL(
  "https://2025electionresults.comelec.gov.ph/data/regions/precinct/",
);
export const ER_DATA_URL = new URL(
  "https://2025electionresults.comelec.gov.ph/data/er/",
);

export interface Region {
  categoryCode: string | null;
  masterCode: string | null;
  code: string;
  name: string;
}
export interface RegionData {
  regions: Region[];
}
export type ElectionReturnData = {
  _tag: "ElectionReturnData";
};

export type DataOrNull = RegionData | ElectionReturnData | null;

export function getDataUrl(code: string, url: URL = GENERAL_DATA_URL) {
  return new URL(`${code}.json`, url);
}

export function getPrecinctUrl(code: string) {
  const prefix = EString.takeLeft(code, 2);
  return new URL(`${prefix}/${code}.json`, PRECINCT_DATA_URL);
}

export function getErUrl(code: string) {
  const prefix = EString.takeLeft(code, 3);
  return new URL(`${prefix}/${code}.json`, ER_DATA_URL);
}
