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
    `https://2025electionresults.comelec.gov.ph/data/regions/local/${code}.json`,
  );
}
function getOverseasAreaUrl(code: string) {
  return new URL(
    `https://2025electionresults.comelec.gov.ph/data/regions/overseas/${code}.json`,
  );
}
function getPrecinctDataUrl(code: string) {
  return new URL(
    "https://2025electionresults.comelec.gov.ph/data/regions/precinct/" +
      `${EString.takeLeft(code, 2)}/${code}.json`,
  );
}
function getElectionReturnUrl(code: string) {
  return new URL(
    "https://2025electionresults.comelec.gov.ph/data/er/" +
      `${EString.takeLeft(code, 3)}/${code}.json`,
  );
}

// TODO: Find a better name for this function 😭
// This is hard-coded, but it should work nonetheless.
function getUrlBasedOnDepth(
  code: string,
  depth: number,
  isOverseas: boolean = false,
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

function hasSubAreas(data: AreaData | ErData): data is AreaData {
  return (data as AreaData).regions !== undefined;
}

function hasErData(data: any): data is ErData {
  return typeof (data as ErData).totalErReceived === "number";
}

// Effectful fetch with specific errors
function fetchUrl<T = AreaData | ErData>(
  url: URL,
  policy: Schedule.Schedule<any, any, never> = Schedule.intersect(
    Schedule.recurs(5),
    Schedule.exponential("100 millis"),
  ),
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
            Effect.orElseFail(() => new InvalidJsonError()),
          ),
        ),
        // This also fails when Cloudflare blocks the request, but
        // otherwise, this should represent a missing file.
        Match.when(403, () => Effect.fail(new FileNotFoundError())),
        Match.orElse(() => Effect.fail(new UnknownStatusCodeError())),
      ),
    ),
    Effect.retry(policy),
  );
}

function sanitizePathName(filename: string) {
  return filename.replaceAll("/", "_").trim();
}

function getFilenameBasedOnData(codeOrFilename: string, data: any): string {
  if (data === null) {
    return `_MISSING.${codeOrFilename}.json`;
  } else if (hasSubAreas(data)) {
    return `_INFO.${codeOrFilename}.json`;
  } else if (hasErData(data)) {
    return `ER.${codeOrFilename}.json`;
  } else {
    return codeOrFilename;
  }
}

// Hacky!
const getFilenameBasedOnDepth = (code: string, depth: number): string =>
  depth < 5 ? `_INFO.${code}.json` : `ER.${code}.json`;

/* Save a JSON representation of the data to folderPath with filename.
 * By default, it creates the directory if it does not already exist.
 */
function saveJson<T = any>(
  codeOrFilename: string,
  folderPath: string,
  data: any,
  makeDirectory: boolean = true,
): Effect.Effect<string, UnknownException, never> {
  return Effect.gen(function* () {
    const filename = getFilenameBasedOnData(codeOrFilename, data);
    if (makeDirectory) {
      yield* Effect.tryPromise(() => mkdir(folderPath, { recursive: true }));
    }
    const joinedPath = path.join(folderPath, `${filename}`);
    yield* Effect.tryPromise(() =>
      fs.writeFile(joinedPath, JSON.stringify(data), "utf8"),
    );
    return joinedPath;
  });
}

function readJson<T>(
  folderPath: string,
  filename: string,
  encoding: BufferEncoding = "utf-8",
) {
  return pipe(
    Effect.tryPromise(() =>
      fs.readFile(path.join(folderPath, filename), { encoding: encoding }),
    ),
    Effect.andThen((data) => JSON.parse(data)),
    Effect.andThen((data) => data as T),
  );
}

// TODO: Move some arguments into options object
function processArea(
  area: Area,
  workingDirectory: string,
  depth: number,
  isOverseas: boolean,
  semaphore: Effect.Semaphore,
  shouldSaveData: boolean = true,
): Effect.Effect<AreaData | ErData | null, never, never> {
  const savePath = path.join(workingDirectory, sanitizePathName(area.name));
  return Effect.gen(function* () {
    // Read from existing JSON file before fetching
    const cachedData = yield* Effect.firstSuccessOf([
      // Hacky!
      depth < 5
        ? readJson<AreaData>(savePath, `_INFO.${area.code}.json`)
        : readJson<ErData>(workingDirectory, `ER.${area.code}.json`),
      Effect.succeed(null),
    ]) as Effect.Effect<AreaData | ErData | null, never, never>;
    if (cachedData !== null) {
      yield* Console.log(
        // Super hacky / janky.
        `${
          depth < 5 ? "[Area]" : "[Election Return]"
        } Existing file: ${path.join(
          savePath,
          getFilenameBasedOnData(area.code, cachedData),
        )}`,
      );
      shouldSaveData = false;
    }

    // Otherwise, fetch the data, then save.
    const data =
      cachedData ??
      (yield* semaphore.withPermits(1)(
        fetchUrl(getUrlBasedOnDepth(area.code, depth, isOverseas)),
      ));
    if (hasSubAreas(data)) {
      if (shouldSaveData) {
        const filePath = yield* saveJson(area.code, savePath, data);
        yield* Console.log(`[Area] Saved: ${filePath}`);
      }
      const effects = data.regions.map((subArea) =>
        Effect.fork(
          processArea(subArea, savePath, depth + 1, isOverseas, semaphore),
        ),
      );
      const fibers = yield* Effect.all(effects);
      yield* Fiber.joinAll(fibers);
    } else {
      // IMPORTANT: Saves to workingDirectory, not savePath!
      if (shouldSaveData) {
        const filePath = yield* saveJson(area.code, workingDirectory, data);
        yield* Console.log(`[Election Return] Saved: ${filePath}`);
      }
    }
    return data;
  }).pipe(
    Effect.catchTag("FileNotFoundError", () =>
      pipe(
        // Again, hacky.
        saveJson(area.code, depth <= 5 ? savePath : workingDirectory, null),
        Effect.tap((filename) => Console.log(`Missing data: ${filename}`)),
        Effect.andThen(() => Effect.succeed(null)),
      ),
    ),
    // TODO: Handle other errors.
    Effect.catchAll(() => Effect.succeed(null)),
  ) as Effect.Effect<AreaData | ErData | null, never, never>;
}

const DATA_DIRECTORY = path.join(".", "data");
function program(isOverseas: boolean = false, maxThreads: number = 100) {
  return Effect.gen(function* () {
    const data = (yield* fetchUrl(
      getUrlBasedOnDepth("0", 0, isOverseas),
    )) as AreaData;
    const semaphore = yield* Effect.makeSemaphore(maxThreads);
    const fibers = yield* Effect.all(
      data.regions.map((subArea) =>
        Effect.fork(
          processArea(subArea, DATA_DIRECTORY, 1, isOverseas, semaphore),
        ),
      ),
    );
    yield* Fiber.joinAll(fibers);
  });
}

Effect.runPromise(program(true, 100)).then(
  Effect.runPromise(program(false, 100)),
);
