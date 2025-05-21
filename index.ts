import {
  Array as EArray,
  Effect,
  Match,
  pipe,
  Schedule,
  String as EString,
  Console,
  Queue,
  Option,
  Chunk,
  Fiber,
} from "effect";
import { type AreaData, type ErData, type Area } from "./utils";
import { promises as fs } from "node:fs";
import path from "path";
import type { UnknownException } from "effect/Cause";
import { mkdir } from "node:fs/promises";

function getLocalAreaUrl(code: string) {
  return new URL(
    `https://2025electionresults.comelec.gov.ph/data/regions/local/${code}.json`
  );
}
function getOverseasAreaUrl(code: string) {
  return new URL(
    `https://2025electionresults.comelec.gov.ph/data/regions/overseas/${code}.json`
  );
}
function getPrecinctDataUrl(code: string) {
  return new URL(
    "https://2025electionresults.comelec.gov.ph/data/regions/precinct/" +
      `${EString.takeLeft(code, 2)}/${code}.json`
  );
}
function getElectionReturnUrl(code: string) {
  return new URL(
    "https://2025electionresults.comelec.gov.ph/data/er/" +
      `${EString.takeLeft(code, 3)}/${code}.json`
  );
}

// TODO: Find a better name for this function 😭
// This is hard-coded, but it should work nonetheless.
function getUrlBasedOnDepth(
  code: string,
  depth: number,
  isOverseas: boolean = false
) {
  // Normal handling for Local ERs and COCs
  if (depth <= 3) {
    return (isOverseas ? getOverseasAreaUrl : getLocalAreaUrl)(code);
  } else if (depth === 4) {
    return getPrecinctDataUrl(code);
  } else {
    return getElectionReturnUrl(code);
  }
}

class FileNotFoundError {
  readonly _tag = "FileNotFoundError";
}

class UnknownStatusCodeError {
  readonly _tag = "UnknownStatusCodeError";
}

// Just a helper error. (Hack!)
class IsElectionReturn {
  readonly _tag = "IsElectionReturn";
}

// Effectful fetch with specific errors
const fetchUrl = (
  url: URL,
  policy: Schedule.Schedule<any, any, never> = Schedule.intersect(
    Schedule.recurs(5),
    Schedule.exponential("100 millis")
  )
) =>
  pipe(
    Effect.tryPromise(() => fetch(url)),
    Effect.andThen((response) =>
      Match.value(response.status).pipe(
        Match.when(200, () => Effect.promise(() => response.json())),
        // This also fails when Cloudflare blocks the request, but
        // otherwise, this should represent a missing file.
        Match.when(403, () => Effect.fail(new FileNotFoundError())),
        Match.orElse(() => Effect.fail(new UnknownStatusCodeError()))
      )
    ),
    Effect.retry(policy)
  ) as Effect.Effect<
    AreaData | ErData,
    FileNotFoundError | UnknownStatusCodeError | UnknownException,
    never
  >;

/* Save a JSON representation of the data to folderPath with filename.
 * By default, it creates the directory if it does not already exist.
 */
function saveDataToFile(
  filename: string,
  folderPath: string,
  data: any,
  makeDirectory: boolean = true
) {
  return pipe(
    Effect.if(makeDirectory, {
      onTrue: () =>
        Effect.tryPromise(() => mkdir(folderPath, { recursive: true })),
      onFalse: () => Effect.succeed(null),
    }),
    Effect.andThen(() =>
      Effect.tryPromise(() =>
        fs.writeFile(
          path.join(folderPath, `${filename}`),
          JSON.stringify(data),
          "utf8"
        )
      )
    ),
    Effect.andThen(() => Effect.succeed(path.join(folderPath, filename)))
  );
}

function hasSubAreas(data: AreaData | ErData): data is AreaData {
  return (data as AreaData).regions !== undefined;
}

const processArea = (
  area: Area,
  folderToSaveTo: string,
  depth: number,
  semaphore: Effect.Semaphore
): Effect.Effect<AreaData | ErData | null, never, never> =>
  pipe(
    fetchUrl(getUrlBasedOnDepth(area.code, depth)),
    Effect.tap((data) =>
      hasSubAreas(data)
        ? pipe(
            saveDataToFile(`_INFO.${area.code}.json`, folderToSaveTo, data),
            Effect.tap((filename) => Console.log(`Saved: ${filename}`)),
            Effect.andThen(() =>
              data.regions.map((subArea) =>
                processArea(
                  subArea,
                  path.join(folderToSaveTo, subArea.name.replaceAll("/", "_")),
                  depth + 1,
                  semaphore
                ).pipe(Effect.fork)
              )
            ),
            Effect.andThen((effects) => Effect.all(effects)),
            Effect.andThen((fibers) => Fiber.joinAll(fibers))
          )
        : pipe(
            saveDataToFile(`${area.code}.json`, folderToSaveTo, data),
            Effect.tap((filename) => Console.log(`Saved: ${filename}`))
          )
    ),
    Effect.catchAll(() => Effect.succeed(null))
  );

const DATA_DIRECTORY = path.join(".", "data");
function program(maxThreads: number = 100) {
  return pipe(
    fetchUrl(getUrlBasedOnDepth("0", 0)),
    Effect.orDie,
    Effect.andThen((data) => data as AreaData),
    Effect.andThen((data) =>
      pipe(
        Effect.makeSemaphore(maxThreads),
        Effect.andThen((semaphore) => ({
          data: data,
          semaphore: semaphore,
        }))
      )
    ),
    Effect.andThen(({ data, semaphore }) =>
      data.regions.map((subArea) =>
        processArea(
          subArea,
          path.join(DATA_DIRECTORY, subArea.name.replaceAll("/", "_")),
          1,
          semaphore
        ).pipe(Effect.fork)
      )
    ),
    Effect.andThen((effects) => Effect.all(effects)),
    Effect.andThen((fibers) => Fiber.joinAll(fibers))
  );
}

Effect.runPromise(program(100));
