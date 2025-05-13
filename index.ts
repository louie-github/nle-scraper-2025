import { Effect, String as EString, pipe, Schedule } from "effect";
import type { UnknownException } from "effect/Cause";
import {
  getDataUrl,
  getPrecinctUrl,
  getErUrl,
  type RegionData,
  type ElectionReturnData,
} from "./utils";

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
