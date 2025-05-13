import { Console, Effect, Match, pipe, Schedule } from "effect";
import {
  getDataUrl,
  getPrecinctUrl,
  getErUrl,
  type RegionData,
  type ElectionReturnData,
} from "./utils";
import { promises as fs } from "node:fs";
import path from "path";

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
    Effect.tryPromise(() => fetch(url)),
    Effect.andThen((response) =>
      Match.value(response.status).pipe(
        Match.when(200, () => Effect.promise(() => response.json())),
        Match.when(403, () => Effect.fail(new FileNotFoundError())),
        Match.orElse(() => Effect.fail(new UnknownStatusCodeError())),
      ),
    ),
    Effect.retry(policy),
  );

const downloadElectionReturn = (
  precinct_code: string,
  folderPath: string,
) =>
  pipe(
    getErUrl(precinct_code),
    fetchRetryJsonData,
    Effect.andThen((data) =>
      Effect.tryPromise(() =>
        fs.writeFile(
          path.join(folderPath, `${precinct_code}.json`),
          JSON.stringify(data),
          "utf8",
        ),
      ),
    ),
    Effect.andThen(
      Console.log(`Wrote to file: ${folderPath}/${precinct_code}.json`),
    ),
    Effect.catchAll((err) =>
      Console.log(`Error retrieving ${precinct_code}.json: ${err}`),
    ),
  );

Effect.runPromise(downloadElectionReturn("24020443", "."));
