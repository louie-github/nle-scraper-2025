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
  type GeoLevel,
  LOCAL_START_CODE,
  type Area,
  GLRegion,
  GLProvince,
  GLCity,
  GLBarangay,
} from "./utils";
import { promises as fs } from "node:fs";
import path from "path";
import type { UnknownException } from "effect/Cause";
import { mkdir } from "node:fs/promises";

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
    Schedule.exponential("100 millis"),
  ),
) =>
  pipe(
    Effect.tryPromise(() => fetch(url)),
    Effect.andThen((response) =>
      Match.value(response.status).pipe(
        Match.when(200, () => Effect.promise(() => response.json())),
        // This also fails when Cloudflare blocks the request, but
        // otherwise, this should represent a missing file.
        Match.when(403, () => Effect.fail(new FileNotFoundError())),
        Match.orElse(() => Effect.fail(new UnknownStatusCodeError())),
      ),
    ),
    Effect.retry(policy),
  ) as Effect.Effect<
    AreaData | ErData,
    FileNotFoundError | UnknownStatusCodeError | UnknownException,
    never
  >;

function saveDataToFile(
  filename: string,
  data: any,
  folderPath: string,
) {
  return pipe(
    Effect.tryPromise(() => mkdir(folderPath, { recursive: true })),
    Effect.andThen(() =>
      Effect.tryPromise(() =>
        fs.writeFile(
          path.join(folderPath, `${filename}`),
          JSON.stringify(data),
          "utf8",
        ),
      ),
    ),
  );
}

function fetchAreaData(code: string) {
  return fetchJson(getDataUrl(code)).pipe(
    Effect.catchAll(() => Effect.succeed(null)),
  ) as Effect.Effect<AreaData | null, never, never>;
}
function fetchPrecinctData(code: string) {
  return fetchJson(getPrecinctUrl(code)).pipe(
    Effect.catchAll(() => Effect.succeed(null)),
  ) as Effect.Effect<AreaData | null, never, never>;
}
function fetchErData(code: string) {
  return fetchJson(getErUrl(code)).pipe(
    Effect.catchAll(() => Effect.succeed(null)),
  ) as Effect.Effect<ErData | null, never, never>;
}

function getRegionLevelFolder(
  regionLevel: GeoLevel,
  baseDirectory: string = "./data",
): string {
  if (regionLevel.parent) {
    return path.join(
      getRegionLevelFolder(regionLevel.parent),
      regionLevel.name.replace("/", "-"),
    );
  } else {
    return path.join(baseDirectory, regionLevel.name.replace("/", "-"));
  }
}

const DATA_DIRECTORY = path.join(".", "data");
const program = Effect.gen(function* () {
  const regions = yield* fetchAreaData(LOCAL_START_CODE);
  if (regions === null) {
    throw new Error("Failed to get initial region list!");
  }

  yield* Effect.forEach(
    regions.regions,
    (region) =>
      Effect.gen(function* () {
        const regionData = yield* fetchAreaData(region.code);
        if (regionData === null) return;

        yield* Effect.forEach(
          regionData.regions,
          (province) =>
            Effect.gen(function* () {
              const provinceData = yield* fetchAreaData(province.code);
              if (provinceData === null) return;

              for (const city of provinceData.regions) {
                const cityData = yield* fetchAreaData(city.code);
                if (cityData === null) continue;

                for (const barangay of cityData.regions) {
                  const barangayData = yield* fetchPrecinctData(
                    barangay.code,
                  );
                  if (barangayData === null) continue;

                  for (const precinct of barangayData.regions) {
                    const precinctData = yield* fetchErData(
                      precinct.code,
                    );
                    if (precinctData === null) continue;

                    const filename = precinct.code.trim() + ".json";
                    const folderPath = path.join(
                      DATA_DIRECTORY,
                      region.name.replaceAll("/", "-").trim(),
                      province.name.replaceAll("/", "-").trim(),
                      city.name.replaceAll("/", "-").trim(),
                      barangay.name.replaceAll("/", "-").trim(),
                    );
                    console.log(`Saving: ${folderPath}/${filename}`);
                    yield* saveDataToFile(
                      filename,
                      precinctData,
                      folderPath,
                    );
                  }
                }
              }
            }),
          { concurrency: 8 },
        );
      }),
    { concurrency: 8 },
  );
});

Effect.runPromise(program);
