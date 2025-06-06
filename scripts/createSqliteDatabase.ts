/*
This scripts assumes that tables have been created. If this is not the
case, please run `createTables.sql`.
*/
import { Database } from "bun:sqlite";
import { Array, Console, Effect, HashMap, Option, Order, pipe } from "effect";
import fs from "fs/promises";
import path from "path";
import type { Area, AreaData, ErCandidate, ErData } from "../utils";

const db = new Database("./data.db", { strict: true });

function getCodeFromFilename(filename: string): string {
  return filename.replace(/(?:_INFO|ER)\.(\w+)\.json/, "$1");
}

// Create a mapping of CODE to filename
function cacheLookups(
  startDirectory: string,
): Effect.Effect<HashMap.HashMap<string, string>, never, never> {
  return Effect.Do.pipe(
    Effect.bind("subPaths", () =>
      Effect.tryPromise(() => fs.readdir(startDirectory)),
    ),
    Effect.let("jsonFiles", ({ subPaths }) =>
      Array.filter(
        subPaths,
        (subPath) =>
          subPath.endsWith(".json") && !subPath.startsWith("_MISSING"),
      ),
    ),
    Effect.bind("subFolders", ({ subPaths }) =>
      Effect.filter(
        subPaths,
        (subPath) =>
          pipe(
            Effect.tryPromise(() =>
              fs.stat(path.join(startDirectory, subPath)),
            ),
            Effect.andThen((stats) => stats.isDirectory()),
          ),
        { concurrency: "unbounded" },
      ),
    ),
    Effect.andThen(({ jsonFiles, subFolders }) =>
      pipe(
        Effect.all(
          Array.map(subFolders, (subFolder) =>
            cacheLookups(path.join(startDirectory, subFolder)),
          ),
          { concurrency: "unbounded" },
        ),
        Effect.andThen(
          Array.append(
            pipe(
              Array.map(jsonFiles, (filename): [string, string] => [
                getCodeFromFilename(filename),
                path.join(startDirectory, filename),
              ]),
              HashMap.fromIterable,
            ),
          ),
        ),
        Effect.andThen(
          Array.reduce(HashMap.empty<string, string>(), (acc, hm) =>
            HashMap.union(acc, hm),
          ),
        ),
      ),
    ),
  ).pipe(
    Effect.catchAll((err) =>
      pipe(
        Console.log(err),
        Effect.andThen(() => HashMap.empty<string, string>()),
      ),
    ),
  );
}

function readJson(filePath: string) {
  return pipe(
    Effect.tryPromise(() => fs.readFile(filePath, { encoding: "utf-8" })),
    Effect.andThen((data) => JSON.parse(data) as AreaData | ErData),
  );
}

const AREA_INFO_INSERT_QUERY = db.query(
  `
  INSERT OR REPLACE INTO area_info
  (code, master_code, category_code, name)
  VALUES
  ($code, $masterCode, $categoryCode, $name);
  `,
);

const AREA_ADMIN_LEVEL_INSERT_QUERY = db.query(
  `
  INSERT OR REPLACE INTO area_admin_level
  (code, level)
  VALUES
  ($code, $level);
  `,
);

const PRECINCT_INFO_INSERT_QUERY = db.query(
  `INSERT OR REPLACE INTO precinct_info
   (machine_id, master_code, total_er_received, location, voting_center,
   precinct_id, precincts_in_cluster, abstentions, registered_voters,
   actual_voters, valid_ballots)
   VALUES
   ($machineId, $masterCode, $totalErReceived, $location, $votingCenter,
   $precinctId, $precinctsInCluster, $abstentions, $registeredVoters,
   $actualVoters, $validBallots);
  `,
);

const SENATE_RESULTS_INSERT_QUERY = db.query(
  `INSERT OR REPLACE INTO senate_results
   VALUES
   (
     $1,
     $2, $03, $04, $05, $06, $07, $08, $09, $10, $11, $12, $13, $14,
     $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27,
     $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40,
     $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51, $52, $53,
     $54, $55, $56, $57, $58, $59, $60, $61, $62, $63, $64, $65, $66,
     $67
   );
  `,
);

const ADMIN_LEVEL_SELECT_QUERY = db.query(
  `
  SELECT level from area_admin_level
  WHERE code = $code;
  `,
);

function sqlInsertArea(area: Area, adminLevel: number | null) {
  AREA_INFO_INSERT_QUERY.run({
    code: area.code,
    masterCode: area.masterCode,
    categoryCode: area.categoryCode,
    name: area.name,
  });
  AREA_ADMIN_LEVEL_INSERT_QUERY.run({
    code: area.code,
    level: adminLevel,
  });
}

function sqlInsertElectionReturn(electionReturn: ErData, masterCode: string) {
  PRECINCT_INFO_INSERT_QUERY.run({
    machineId: electionReturn.information.machineId,
    masterCode: masterCode,
    totalErReceived: electionReturn.totalErReceived,
    location: electionReturn.information.location,
    votingCenter: electionReturn.information.votingCenter,
    precinctId: electionReturn.information.precinctId,
    precinctsInCluster: electionReturn.information.precinctInCluster,
    abstentions: electionReturn.information.abstentions,
    registeredVoters: electionReturn.information.numberOfRegisteredVoters,
    actualVoters: electionReturn.information.numberOfActuallyVoters,
    validBallots: electionReturn.information.numberOfValidBallot,
  });
  SENATE_RESULTS_INSERT_QUERY.run(
    electionReturn.information.machineId,
    ...pipe(
      Array.filter(electionReturn.national, (contest) =>
        contest.contestName.toUpperCase().includes("SENATOR"),
      ),
      Array.head,
      Option.getOrThrow,
      (contest) => contest.candidates.candidates,
      Array.sort(
        Order.mapInput(Order.number, (candidate: ErCandidate) =>
          parseInt(candidate.name.split(".")[0]!),
        ),
      ),
      Array.map((candidate) => candidate.votes),
    ),
  );
}

function sqlGetAdminLevel(code: string | null): number | null {
  if (code === null) return null;
  return (
    ADMIN_LEVEL_SELECT_QUERY.get({ code: code }) as {
      level: number | null;
    }
  ).level;
}

function isElectionReturn(data: AreaData | ErData): data is ErData {
  return (data as ErData).totalErReceived !== undefined;
}

function processAreaRecursively(
  area: Area,
  masterCode: string | null,
  lookupTable: HashMap.HashMap<string, string>,
): Effect.Effect<void, never, never> {
  return pipe(
    HashMap.get(lookupTable, area.code),
    // Effect.tap((filePath) => Console.log(`Reading file: ${filePath}`)),
    Effect.andThen((filePath) => readJson(filePath)),
    Effect.andThen((data) =>
      isElectionReturn(data)
        ? pipe(
            Console.log(
              "(Election Return) inserting: " +
                `[${data.information.machineId}] ${data.information.location}`,
            ),
            Effect.andThen(() =>
              Effect.try(() => sqlInsertElectionReturn(data, masterCode!)),
            ),
          )
        : pipe(
            Console.log(`(Area) inserting: [${area.code}] ${area.name}`),
            Effect.andThen(() =>
              Effect.try(() => sqlGetAdminLevel(masterCode)),
            ),
            Effect.andThen((adminLevel) =>
              adminLevel != null ? adminLevel + 1 : 0,
            ),
            Effect.andThen((adminLevel) =>
              Effect.try(() => sqlInsertArea(area, adminLevel)),
            ),
            Effect.andThen(() =>
              Effect.forEach(data.regions, (subArea) =>
                processAreaRecursively(subArea, area.code, lookupTable),
              ),
            ),
            Effect.orElseSucceed(() => null),
          ),
    ),
    Effect.orElseSucceed(() => null),
  );
}

const program = (startDirectory: string) =>
  pipe(
    Console.log("Caching lookups..."),
    Effect.andThen(() => cacheLookups(startDirectory)),
    Effect.andThen((lookupTable) =>
      HashMap.set(
        lookupTable,
        "LOCAL_0",
        path.join(startDirectory, "_INFO.LOCAL_0.json"),
      ),
    ),
    Effect.andThen((lookupTable) =>
      HashMap.set(
        lookupTable,
        "OVERSEAS_0",
        path.join(startDirectory, "_INFO.OVERSEAS_0.json"),
      ),
    ),
    Effect.tap((lookupTable) =>
      processAreaRecursively(
        {
          code: "LOCAL_0",
          name: "Philippines",
          masterCode: null,
          categoryCode: null,
        },
        null,
        lookupTable,
      ),
    ),
    Effect.tap((lookupTable) =>
      processAreaRecursively(
        {
          code: "OVERSEAS_0",
          name: "Overseas",
          masterCode: null,
          categoryCode: null,
        },
        null,
        lookupTable,
      ),
    ),
  );

Effect.runPromise(program("./data")).then();
