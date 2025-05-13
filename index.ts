import { Console, Effect, Match, pipe, Schedule } from "effect";
import {
  getDataUrl,
  getPrecinctUrl,
  getErUrl,
  type RegionData,
  type ElectionReturnData,
} from "./utils";

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

const program = pipe(
  getErUrl("24020443"),
  fetchRetryJsonData,
  Effect.catchTag("FileNotFoundError", () => Console.log("403 Error.")),
  Effect.catchTag("UnknownStatusCodeError", () =>
    Console.log("Unknown status code encountered."),
  ),
  Effect.catchTag("UnknownException", () =>
    Console.log("Unknown exception occurred while fetching JSON data."),
  ),
  Effect.tap(console.log),
);

Effect.runPromise(program);
