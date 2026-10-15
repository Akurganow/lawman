import pkg from "../package.json";
import { EXIT, Fail, checkEnv, out, probe } from "./db";
import { next, pause, precinct, role } from "./precincts";
import { dispatch, tick } from "./dispatch";
import { alarm, status } from "./alarms";
import { cap, last, leads, seen, sync } from "./sync";
import { lintBodyCommand, lintPageCommand } from "./lint";

export { EXIT, Fail, MIGRATIONS, checkEnv, dbPath, now, open, out, probeLine } from "./db";
export { check } from "./args";
export { pickNext } from "./precincts";
export {
  MARKER_MAX_BYTES,
  canonicalId,
  collectIssueMarkers,
  decodeIdPart,
  encodeIdPart,
  extractMarkers,
  parseMarker,
  type Found,
  type Marker,
} from "./markers";
export { CAP_TABLE, SYNC_LIMIT } from "./sync";
export { BODY_MAX_BYTES, CONSTITUTION_HEADINGS, DEPARTMENT_HEADINGS, lintBody, lintPage, type PageLint } from "./lint";

type Handler = (args: string[]) => void | number;

export const COMMANDS: Record<string, Handler> = { probe, precinct, role, next, dispatch, tick, pause, alarm, status, sync, leads, seen, cap, last, "lint-body": lintBodyCommand, "lint-page": lintPageCommand };

export function main(argv: string[]): number {
  try {
    checkEnv();
    const [name, ...args] = argv;
    if (name === "--version") {
      out(pkg.version);
    } else if (name !== undefined && Object.hasOwn(COMMANDS, name)) {
      return COMMANDS[name](args) ?? EXIT.OK;
    } else {
      throw new Fail(EXIT.USAGE, `usage: journal <${["--version", ...Object.keys(COMMANDS)].join("|")}> [args]`);
    }
    return EXIT.OK;
  } catch (e) {
    process.stderr.write(`journal: ${e instanceof Error ? e.message : String(e)}\n`);
    return e instanceof Fail ? e.code : EXIT.USAGE;
  }
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2));
