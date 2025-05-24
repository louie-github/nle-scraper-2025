import {
  Console,
  Effect,
  String as EString,
  Fiber,
  Match,
  pipe,
  Schedule,
} from "effect";
import type { UnknownException } from "effect/Cause";
import { promises as fs } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "path";
import { type Area, type AreaData, type ErData } from "./utils";

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
class InvalidJsonError {
  readonly _tag = "InvalidJsonError";
}

// Effectful fetch with specific errors
function fetchUrl<T = AreaData | ErData>(
  url: URL,
  policy: Schedule.Schedule<any, any, never> = Schedule.intersect(
    Schedule.recurs(5),
    Schedule.exponential("100 millis")
  )
): Effect.Effect<
  T,
  | FileNotFoundError
  | UnknownStatusCodeError
  | InvalidJsonError
  | UnknownException,
  never
> {
  return pipe(
    Effect.tryPromise(() => fetch(url)),
    Effect.andThen((response) =>
      Match.value(response.status).pipe(
        Match.when(200, () =>
          pipe(
            Effect.tryPromise(() => response.json()),
            Effect.map((data) => data as T),
            Effect.orElseFail(() => new InvalidJsonError())
          )
        ),
        // This also fails when Cloudflare blocks the request, but
        // otherwise, this should represent a missing file.
        Match.when(403, () => Effect.fail(new FileNotFoundError())),
        Match.orElse(() => Effect.fail(new UnknownStatusCodeError()))
      )
    ),
    Effect.retry(policy)
  );
}

// TODO: Extract out into constants, type union, or something.
const getMissingJsonFilename = (code: string) => `_MISSING.${code}.json`;
const getInfoJsonFilename = (code: string) => `_INFO.${code}.json`;
const getErJsonFilename = (code: string) => `ER.${code}.json`;

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

function sanitizePathName(filename: string) {
  return filename.replaceAll("/", "_").trim();
}

function readJson<T>(
  folderPath: string,
  filename: string,
  encoding: BufferEncoding = "utf-8"
) {
  return Effect.tryPromise(
    async () =>
      JSON.parse(
        await fs.readFile(path.join(folderPath, filename), {
          encoding: encoding,
        })
      ) as T
  );
}

function processArea(
  area: Area,
  workingDirectory: string,
  depth: number,
  isOverseas: boolean,
  semaphore: Effect.Semaphore
): Effect.Effect<AreaData | ErData | null, never, never> {
  const savePath = path.join(workingDirectory, sanitizePathName(area.name));
  return Effect.gen(function* () {
    // Read from existing JSON file before fetching
    const cachedData = yield* Effect.firstSuccessOf([
      readJson<AreaData>(savePath, getInfoJsonFilename(area.code)),
      readJson<ErData>(savePath, getErJsonFilename(area.code)),
      Effect.succeed(null), // fallback
    ]);
    if (cachedData !== null) {
      const filePath = path.join(
        savePath,
        hasSubAreas(cachedData)
          ? getInfoJsonFilename(area.code)
          : getErJsonFilename(area.code)
      );
      yield* Console.log(`Existing file: ${filePath}`);
      return cachedData;
    }

    // Otherwise, fetch the data, then save.
    const data = yield* semaphore.withPermits(1)(
      fetchUrl(getUrlBasedOnDepth(area.code, depth, isOverseas))
    );
    // Case 1: AreaData
    if (hasSubAreas(data)) {
      const filePath = yield* saveDataToFile(
        getInfoJsonFilename(area.code),
        savePath,
        data
      );
      yield* Console.log(`[Area] Saved: ${filePath}`);

      const fibers = yield* Effect.all(
        data.regions.map((subArea) =>
          Effect.fork(
            processArea(subArea, savePath, depth + 1, isOverseas, semaphore)
          )
        )
      );
      yield* Fiber.joinAll(fibers);
    } else {
      const filePath = yield* saveDataToFile(
        getErJsonFilename(area.code),
        savePath,
        data
      );
      yield* Console.log(`[Election Return] Saved: ${filePath}`);
    }

    return data;
  }).pipe(
    Effect.catchTag("FileNotFoundError", () =>
      pipe(
        saveDataToFile(getMissingJsonFilename(area.code), savePath, null),
        Effect.tap((filename) => Console.log(`Missing data: ${filename}`)),
        Effect.andThen(() => Effect.succeed(null))
      )
    ),
    // TODO: Handle other errors.
    Effect.catchAll(() => Effect.succeed(null))
  );
}

const DATA_DIRECTORY = path.join(".", "data");
function program(isOverseas: boolean = false, maxThreads: number = 100) {
  return Effect.gen(function* () {
    const data = (yield* fetchUrl(
      getUrlBasedOnDepth("0", 0, isOverseas)
    )) as AreaData;
    const semaphore = yield* Effect.makeSemaphore(maxThreads);
    const fibers = yield* Effect.all(
      data.regions.map((subArea) =>
        Effect.fork(
          processArea(subArea, DATA_DIRECTORY, 1, isOverseas, semaphore)
        )
      )
    );
    yield* Fiber.joinAll(fibers);
  });
}

const IS_OVERSEAS = false;
Effect.runPromise(program(IS_OVERSEAS, 100));
