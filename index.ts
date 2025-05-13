import { Effect, String as EString, pipe, Schedule } from "effect";
import type { UnknownException } from "effect/Cause";
import { All } from "effect/LogLevel";

const GENERAL_DATA_URL = new URL(
  "https://2025electionresults.comelec.gov.ph/data/regions/local/",
);
const PRECINCT_DATA_URL = new URL(
  "https://2025electionresults.comelec.gov.ph/data/regions/precinct/",
);
const ER_DATA_URL = new URL(
  "https://2025electionresults.comelec.gov.ph/data/er/",
);

interface RegionData {
  regions: [
    {
      categoryCode: string | null;
      masterCode: string | null;
      code: string;
      name: string;
    },
  ];
}

type ElectionReturnData = any;

function getDataUrl(code: string, url: URL = GENERAL_DATA_URL) {
  return new URL(`${code}.json`, url);
}

function getPrecinctUrl(code: string) {
  const prefix = EString.takeLeft(code, 2);
  return new URL(`${prefix}/${code}.json`, PRECINCT_DATA_URL);
}

function getErUrl(code: string) {
  const prefix = EString.takeLeft(code, 3);
  return new URL(`${prefix}/${code}.json`, ER_DATA_URL);
}

const fetchJson = (url: URL) =>
  pipe(
    Effect.tryPromise(() => fetch(url)),
    Effect.flatMap((response) =>
      response.status === 200
        ? Effect.promise(() => response.json())
        : response.status === 403
          ? Effect.succeed(null)
          : Effect.fail(
              new Error("Unhandled status code (not 200, not 403)"),
            ),
    ),
  ) as Effect.Effect<
    RegionData | ElectionReturnData | null,
    UnknownException | Error,
    never
  >;

const fetchRetryJson = (url: URL) =>
  Effect.retry(
    fetchJson(url),
    Schedule.union(
      Schedule.recurs(5),
      Schedule.exponential("100 millis"),
    ),
  );

const program = pipe(fetchRetryJson(getDataUrl("0")));

Effect.runPromise(program).then(console.log);
