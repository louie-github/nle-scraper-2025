import { String as EString } from "effect";

export const AREA_DATA_URL = new URL(
  "https://2025electionresults.comelec.gov.ph/data/regions/local/",
);
export const PRECINCT_DATA_URL = new URL(
  "https://2025electionresults.comelec.gov.ph/data/regions/precinct/",
);
export const ER_DATA_URL = new URL(
  "https://2025electionresults.comelec.gov.ph/data/er/",
);

export const LOCAL_START_CODE = "0";

export interface Area {
  categoryCode: string | null;
  masterCode: string | null;
  code: string;
  name: string;
}
export interface AreaData {
  regions: Area[];
}

export interface ErCandidate {
  name: string;
  votes: number;
  percentage: number;
}

export interface ErContest {
  contestCode: string;
  contestName: string;
  statistic: {
    overVotes: number;
    underVotes: number;
    validVotes: number;
    obtainedVotes: number;
  };
  candidates: {
    candidates: ErCandidate[];
  };
}

export interface ErData {
  totalErReceived: number;
  information: {
    machineId: string;
    location: string;
    votingCenter: string;
    precinctId: string;
    precinctInCluster: string;
    abstentions: number;
    numberOfRegisteredVoters: number;
    numberOfActuallyVoters: number;
    numberOfValidBallot: number;
    turnout: number;
  };
  national: ErContest[];
  local: ErContest[];
}

export interface GeoLevel {
  level: number;
  name: string;
  parent?: GeoLevel;
}
export const GLRegion: GeoLevel = { level: 0, name: "Region" };
export const GLProvince: GeoLevel = {
  level: 1,
  name: "Province/District",
  parent: GLRegion,
};
export const GLCity: GeoLevel = {
  level: 2,
  name: "City/Municipality",
  parent: GLProvince,
};
export const GLBarangay: GeoLevel = {
  level: 3,
  name: "Barangay",
  parent: GLCity,
};

export type DataOrNull = AreaData | ErData | null;

export function getDataUrl(code: string, url: URL = AREA_DATA_URL) {
  return new URL(`${code}.json`, url);
}

export function getPrecinctUrl(
  code: string,
  url: URL = PRECINCT_DATA_URL,
) {
  const prefix = EString.takeLeft(code, 2);
  return new URL(`${prefix}/${code}.json`, url);
}

export function getErUrl(code: string, url: URL = ER_DATA_URL) {
  const prefix = EString.takeLeft(code, 3);
  return new URL(`${prefix}/${code}.json`, url);
}
