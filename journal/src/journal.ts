import pkg from "../package.json";
import { alarm, status } from "./alarms";
import { pick } from "./args";
import { caseCommand } from "./cases";
import { checkEnv, EXIT, Fail, out, probe } from "./db";
import { decider } from "./decider";
import { departmentLineCommand } from "./department-line";
import { dispatch, tick } from "./dispatch";
import { dueCommand } from "./due";
import { form } from "./form";
import { intakeCommand } from "./intake";
import { jev } from "./jev";
import { lawSync } from "./law-sync";
import { cap, last, leads, seen } from "./leads";
import { lintPageCommand } from "./lint";
import { precedentCommand, precedentMergeCommand } from "./precedent";
import { next, precinct, role } from "./precincts";
import { pullCommand } from "./pull-stage";
import { rotation } from "./rotation";
import { sync } from "./sync";
import { wake } from "./wake";

export { open } from "./db";

type Handler =
	| ((args: string[]) => void)
	| ((args: string[]) => number)
	| ((args: string[]) => Promise<number>);

// the cleaning libraries load only for the commands that use them, so every
// other call starts as fast as before
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
	"lint-body": async (args) =>
		(await import("./lint-body")).lintBodyCommand(args),
	"lint-page": lintPageCommand,
	"department-line": departmentLineCommand,
	precedent: precedentCommand,
	"precedent-merge": precedentMergeCommand,
	pull: pullCommand,
	handoff: async (args) => (await import("./handoff")).handoffCommand(args),
	clean: async (args) => (await import("./clean-command")).cleanCommand(args),
	decider,
	form,
	jev,
	wake,
	"law-sync": lawSync,
};

function failed(e: unknown): number {
	process.stderr.write(
		`journal: ${e instanceof Error ? e.message : String(e)}\n`,
	);
	return e instanceof Fail ? e.code : EXIT.USAGE;
}

export function main(argv: string[]): number | Promise<number> {
	try {
		checkEnv();
		const [name, ...args] = argv;
		const command = pick(COMMANDS, name);
		if (name === "--version") {
			out(pkg.version);
		} else if (command !== undefined) {
			const returned = command(args);
			return returned instanceof Promise
				? returned.catch(failed)
				: (returned ?? EXIT.OK);
		} else {
			throw new Fail(
				EXIT.USAGE,
				`usage: journal <${["--version", ...Object.keys(COMMANDS)].join("|")}> [args]`,
			);
		}
		return EXIT.OK;
	} catch (e) {
		return failed(e);
	}
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
