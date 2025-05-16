import {
  Array as EArray,
  Console,
  Effect,
  Match,
  pipe,
  Schedule,
} from "effect";
import {
  getDataUrl,
  getPrecinctUrl,
  getErUrl,
  type AreaData,
  type ErData,
  LOCAL_START_CODE,
  type Area,
} from "./utils";
import { promises as fs } from "node:fs";
import path from "path";
import type { UnknownException } from "effect/Cause";
import { mkdir } from "node:fs/promises";
import type { Concurrency } from "effect/Types";

class FileNotFoundError {
  readonly _tag = "FileNotFoundError";
}

class UnknownStatusCodeError {
  readonly _tag = "UnknownStatusCodeError";
}

const fetchJson = (
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

function saveDataToFile(filename: string, data: any, folderPath: string) {
  return pipe(
    Effect.tryPromise(() => mkdir(folderPath, { recursive: true })),
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

function saveErData(
  data: ErData | {},
  region: Area,
  province: Area,
  city: Area,
  barangay: Area,
  precinct: Area
) {
  const folderPath = path.join(
    DATA_DIRECTORY,
    region.name.replaceAll("/", "-").trim(),
    province.name.replaceAll("/", "-").trim(),
    city.name.replaceAll("/", "-").trim(),
    barangay.name.replaceAll("/", "-".trim())
  );
  const filename = data
    ? `${precinct.code}.json`
    : `${precinct.code}.MISSING.json`;
  return pipe(
    saveDataToFile(filename, data, folderPath),
    Effect.tap(() =>
      Console.log(`Saved to file: ${path.join(folderPath, filename)}`)
    )
  );
}

const DATA_DIRECTORY = path.join(".", "data");
const START_CODE = LOCAL_START_CODE;

function processArea(
  area: Area,
  f: (area: Area) => Effect.Effect<any, never, never>,
  options?:
    | {
        readonly concurrency?: Concurrency | undefined;
        readonly batching?: boolean | "inherit" | undefined;
        readonly concurrentFinalizers?: boolean | undefined;
      }
    | undefined
) {
  return pipe(
    // downloadArea(area.name, area.code, levelName, DATA_DIRECTORY, logPrefix),
    fetchJson(getDataUrl(area.code)),
    Effect.andThen((data) => data as AreaData),
    Effect.tap((data) =>
      Effect.forEach(data.regions, f, { ...options, discard: true })
    ),
    Effect.catchAll(() => Effect.succeed(null))
  );
}

const program = pipe(
  fetchJson(getDataUrl(START_CODE)),
  Effect.orDie,
  Effect.andThen((data) => data as AreaData),
  Effect.tap((data) =>
    Effect.forEach(data.regions, (region) =>
      processArea(region, (province) =>
        processArea(province, (city) =>
          processArea(
            city,
            (barangay) =>
              pipe(
                fetchJson(getPrecinctUrl(barangay.code)),
                Effect.andThen((data) => data as AreaData),
                Effect.tap((data) =>
                  Effect.forEach(
                    data.regions,
                    (precinct) =>
                      fetchJson(getErUrl(precinct.code)).pipe(
                        Effect.andThen((data) => data as ErData),
                        // Represent missing data as empty object
                        Effect.catchAll(() => Effect.succeed({})),
                        Effect.tap((data) =>
                          saveErData(
                            data,
                            region,
                            province,
                            city,
                            barangay,
                            precinct
                          )
                        )
                      ),
                    { concurrency: 8 }
                  )
                ),
                Effect.catchAll(() => Effect.succeed(() => null))
              ),
            { concurrency: 8 }
          )
        )
      )
    )
  )
);

Effect.runPromise(program);
