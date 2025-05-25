import { type ErData } from "../utils";

import fs from "node:fs/promises";
import path from "path";
import { SENATORIAL_CANDIDATES } from "./candidates";

const DATA_DIRECTORY = path.normalize(
  path.join(__filename, "..", "..", "data"),
);

async function isDirectory(pathname: string) {
  return (await fs.lstat(pathname)).isDirectory();
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

for await (const filename of enumerateErJsonFiles(DATA_DIRECTORY)) {
  console.log(filename);
}
