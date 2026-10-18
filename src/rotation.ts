import { check, parseArgs } from "./args";
import { out, readStdin, withDb } from "./db";
import { capOf, lastVisits } from "./leads";

const ROTATION_USAGE =
	"rotation <precinct> --role <role> (stdin: department names, one per line)";
const NEVER = "-";

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function rotation(args: string[]): void {
	const { pos, opt } = parseArgs(args, 1, ["role"], ROTATION_USAGE);
	const name = check("precinct", pos[0]);
	const roleName = check("role", opt.role);
	const names = [
		...new Set(
			readStdin()
				.split("\n")
				.filter((line) => line !== ""),
		),
	].map((line) => check("department", line));
	withDb((db) => {
		const visits = new Map(
			lastVisits(db, name, roleName).map((v) => [v.department, v.at]),
		);
		const at = (department: string) => visits.get(department) ?? "";
		names.sort((a, b) => compare(at(a), at(b)) || compare(a, b));
		for (const department of names)
			out(department, at(department) || NEVER, capOf(db, name, department).cap);
	});
}
