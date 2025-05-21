import { type ErData } from "./utils";

import fs from "node:fs/promises";
import path from "path";
import { SENATORIAL_CANDIDATES } from "./senate_candidates";

const DATA_DIRECTORY = path.join(".", "data");

async function* enumerateErData(
  startPathComponents: string[]
): AsyncGenerator<[string[], string], void, unknown> {
  for (const filename of await fs.readdir(path.join(...startPathComponents))) {
    const newPath = [...startPathComponents, filename];
    if (filename.endsWith(".json") && !filename.startsWith("_")) {
      yield [startPathComponents, filename];
    } else if ((await fs.lstat(path.join(...newPath))).isDirectory()) {
      for await (const result of enumerateErData(newPath)) {
        yield result;
      }
    }
  }
}

async function processToRow(pathComponents: string[], filename: string) {
  const data = JSON.parse(
    await fs.readFile(path.join(...pathComponents, filename), {
      encoding: "utf-8",
    })
  ) as ErData;
  const candidateVotes = Object.fromEntries(
    data.national[0]!.candidates.candidates.map((candidate) => [
      candidate.name,
      candidate.votes,
    ])
  );
  return [
    ...pathComponents,
    path.parse(filename).name,
    SENATORIAL_CANDIDATES.map((name) => candidateVotes[name]),
  ].join(",");
}

console.log(
  [
    "region",
    "province_district",
    "city_municipality",
    "barangay",
    "clusteredPrecinct",
    ...Array(SENATORIAL_CANDIDATES.length)
      .keys()
      .map((i) => i + 1),
  ].join(",")
);
for await (const result of enumerateErData([DATA_DIRECTORY])) {
  console.log((await processToRow(...result)).slice("data,".length));
}
