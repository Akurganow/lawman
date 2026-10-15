import pkg from "../package.json";
import { alarm, status } from "./alarms";
import { pick } from "./args";
import { caseCommand } from "./cases";
import { checkEnv, EXIT, Fail, out, probe } from "./db";
import { dispatch, tick } from "./dispatch";
import { cap, last, leads, seen } from "./leads";
import { lintBodyCommand, lintPageCommand } from "./lint";
import { next, pause, precinct, role } from "./precincts";
import { sync } from "./sync";

export { check } from "./args";
export {
	checkEnv,
	dbPath,
	EXIT,
	Fail,
	MIGRATIONS,
	now,
	open,
	out,
	probeLine,
} from "./db";
export { CAP_TABLE } from "./leads";
export {
	BODY_MAX_BYTES,
	CONSTITUTION_HEADINGS,
	DEPARTMENT_HEADINGS,
	lintBody,
	lintPage,
	type PageLint,
} from "./lint";
export {
	canonicalId,
	collectIssueMarkers,
	decodeIdPart,
	encodeIdPart,
	extractMarkers,
	type Found,
	MARKER_MAX_BYTES,
	type Marker,
	parseMarker,
} from "./markers";
export { pickNext } from "./precincts";
export { SYNC_LIMIT } from "./sync";

type Handler = ((args: string[]) => void) | ((args: string[]) => number);

export const COMMANDS: Record<string, Handler> = {
	probe,
	precinct,
	role,
	next,
	dispatch,
	tick,
	pause,
	alarm,
	status,
	sync,
	leads,
	seen,
	cap,
	last,
	case: caseCommand,
	"lint-body": lintBodyCommand,
	"lint-page": lintPageCommand,
};

export function main(argv: string[]): number {
	try {
		checkEnv();
		const [name, ...args] = argv;
		const command = pick(COMMANDS, name);
		if (name === "--version") {
			out(pkg.version);
		} else if (command !== undefined) {
			return command(args) ?? EXIT.OK;
		} else {
			throw new Fail(
				EXIT.USAGE,
				`usage: journal <${["--version", ...Object.keys(COMMANDS)].join("|")}> [args]`,
			);
		}
		return EXIT.OK;
	} catch (e) {
		process.stderr.write(
			`journal: ${e instanceof Error ? e.message : String(e)}\n`,
		);
		return e instanceof Fail ? e.code : EXIT.USAGE;
	}
}

if (import.meta.main) process.exitCode = main(process.argv.slice(2));
