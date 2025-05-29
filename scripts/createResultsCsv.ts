import { type ErData } from "../utils";

import fs from "node:fs/promises";
import path from "path";
import {
  ALYANSA_WITHOUT_CAMILLE,
  DUTERTEN_SLATE,
  KIKO_BAM_HEIDI,
  SENATORIAL_CANDIDATES,
} from "./candidates";

const DATA_DIRECTORY = path.normalize(
  path.join(__filename, "..", "..", "data"),
);

async function isDirectory(pathname: string) {
  return (await fs.lstat(pathname)).isDirectory();
}

const HEADER_ROW = [
  "precinct_id",
  "registered_voters",
  "actual_voters",
  "valid_ballots",
  ...SENATORIAL_CANDIDATES,
];

function toCsvRow(row: string[]): string {
  return row
    .map((cell) =>
      cell.includes(",") || cell.includes('"')
        ? `"${cell.replaceAll('"', '""')}"`
        : cell,
    )
    .join(",");
}

// Yields all the Election Return data-containing JSON files deeply
// recursively.
async function* enumerateErJsonFiles(
  workingDirectory: string,
): AsyncGenerator<string, void, unknown> {
  for (const pathName of await fs.readdir(workingDirectory)) {
    if (pathName.startsWith("ER.") && pathName.endsWith(".json")) {
      yield path.join(workingDirectory, pathName);
      continue;
    } else {
      const directoryName = path.join(workingDirectory, pathName);
      if (await isDirectory(directoryName)) {
        for await (const result of enumerateErJsonFiles(directoryName)) {
          yield result;
        }
      }
    }
  }
}

const getSenateResults = (data: ErData) =>
  Object.fromEntries(
    data.national[0]!.candidates.candidates.map((candidate) => [
      candidate.name,
      candidate.votes,
    ]),
  );

async function processJson(filename: string) {
  const data = JSON.parse(
    await fs.readFile(filename, { encoding: "utf-8" }),
  ) as ErData;
  const {
    precinctId,
    numberOfRegisteredVoters,
    numberOfActuallyVoters,
    numberOfValidBallot,
  } = data.information;
  const senateResults = getSenateResults(data);
  return [
    precinctId.toString(),
    numberOfRegisteredVoters.toString(),
    numberOfActuallyVoters.toString(),
    numberOfValidBallot.toString(),
    ...SENATORIAL_CANDIDATES.map((candidate) =>
      senateResults[candidate]!.toString(),
    ),
  ];
}

console.log(toCsvRow(HEADER_ROW));
for await (const filename of enumerateErJsonFiles(DATA_DIRECTORY)) {
  console.log(toCsvRow(await processJson(filename)));
}
