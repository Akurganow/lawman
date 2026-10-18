import pkg from "../package.json";
import { alarm, status } from "./alarms";
import { pick } from "./args";
import { caseCommand } from "./cases";
import { checkEnv, EXIT, Fail, out, probe } from "./db";
import { decider } from "./decider";
import { departmentLineCommand } from "./department-line";
import { dispatch, tick } from "./dispatch";
import { dueCommand } from "./due";
import { handoffCommand } from "./handoff";
import { intakeCommand } from "./intake";
import { jev } from "./jev";
import { cap, last, leads, seen } from "./leads";
import { lintBodyCommand, lintPageCommand } from "./lint";
import { precedentCommand, precedentMergeCommand } from "./precedent";
import { next, precinct, role } from "./precincts";
import { pullCommand } from "./pull-stage";
import { rotation } from "./rotation";
import { sync } from "./sync";
import { wake } from "./wake";

export { open } from "./db";

type Handler = ((args: string[]) => void) | ((args: string[]) => number);

export const COMMANDS: Record<string, Handler> = {
	probe,
	precinct,
	role,
	next,
	dispatch,
	tick,
	alarm,
	status,
	sync,
	leads,
	seen,
	cap,
	last,
	rotation,
	case: caseCommand,
	due: dueCommand,
	intake: intakeCommand,
	"lint-body": lintBodyCommand,
	"lint-page": lintPageCommand,
	"department-line": departmentLineCommand,
	precedent: precedentCommand,
	"precedent-merge": precedentMergeCommand,
	pull: pullCommand,
	handoff: handoffCommand,
	decider,
	jev,
	wake,
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
