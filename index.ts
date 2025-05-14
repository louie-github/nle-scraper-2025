import { Console, Effect, Match, pipe, Schedule } from "effect";
import {
  getDataUrl,
  type RegionData,
  type ElectionReturnData,
  GENERAL_DATA_URL,
  type DataOrNull,
  type Region,
} from "./utils";
import { promises as fs } from "node:fs";
import path from "path";
import type { UnknownException } from "effect/Cause";

class FileNotFoundError {
  readonly _tag = "FileNotFoundError";
}

class UnknownStatusCodeError {
  readonly _tag = "UnknownStatusCodeError";
}

const fetchRetryJsonData = (
  url: URL,
  policy: Schedule.Schedule<any, any, never> = Schedule.intersect(
    Schedule.recurs(5),
    Schedule.exponential("100 millis"),
  ),
) =>
  pipe(
    Effect.tryPromise(() => fetch(url))
    Effect.andThen((response) =>
      Match.value(response.status).pipe(
        Match.when(200, () => Effect.promise(() => response.json())),
        Match.when(403, () => {
          console.log(response);
          return Effect.fail(new FileNotFoundError());
        }),
        Match.orElse(() => Effect.fail(new UnknownStatusCodeError())),
      ),
    ),
    Effect.retry(policy),
  ) as Effect.Effect<
    RegionData | ElectionReturnData,
    FileNotFoundError | UnknownStatusCodeError | UnknownException,
    never
  >;

function saveData(
  code: string,
  data: RegionData | ElectionReturnData,
  folderPath: string,
) {
  return Effect.tryPromise(() =>
    fs.writeFile(
      path.join(folderPath, `${code}.json`),
      JSON.stringify(data),
      "utf8",
    ),
  );
}

const fetchData = (code: string, url_prefix: URL = GENERAL_DATA_URL) =>
  fetchRetryJsonData(getDataUrl(code, url_prefix));

const fetchAndSaveData = (
  code: string,
  folderPath: string,
  url_prefix: URL = GENERAL_DATA_URL,
) =>
  pipe(
    fetchRetryJsonData(getDataUrl(code, url_prefix)),
    Effect.tap((data) => saveData(code, data, folderPath)),
  );

function processRegion(
  prefix: string,
  mapFunc: (region: Region) => Effect.Effect<any, never, never>,
) {
  return (region: Region) =>
    pipe(
      Console.log(prefix + region.name),
      Effect.andThen(() => fetchData(region.code)),
      Effect.map((data) => data as RegionData),
      Effect.andThen((data) =>
        Effect.all(data.regions.map(mapFunc), { mode: "validate" }),
      ),
      Effect.catchAll(() => Console.log("Error encountered!")),
    );
}

const program = pipe(
  fetchData("0"),
  Effect.orDie,
  Effect.map((data) => data as RegionData),
  Effect.andThen((data) =>
    Effect.all(
      data.regions.map(
        processRegion(
          "Region: ",
          processRegion(
            "  > Province: ",
            processRegion("    > Municipality: ", () =>
              Effect.succeed(null),
            ),
          ),
        ),
      ),
    ),
  ),
);

Effect.runPromise(program);
