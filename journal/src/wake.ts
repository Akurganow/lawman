import { check, parseArgs } from "./args";
import { EXIT, Fail, now, withDb } from "./db";
import { takeableOrders } from "./dispatch";
import { DUTY_DESK, inputOf } from "./input-roles";

// No work prints nothing and loads nothing, so the idle check stays the same
// and fast. Work loads the parser inside this command only.
export function wake(args: string[]): number | Promise<number> {
	const { opt } = parseArgs(args, 0, ["role"], "wake --role <r>");
	const roleName = check("role", opt.role);
	// the same refusal as `tick input --role`, before anything is written
	if (roleName !== DUTY_DESK && inputOf(roleName) === undefined)
		throw new Fail(EXIT.USAGE, `no input for role ${roleName}`);
	const stamp = now();
	// stdout is written only after every database step succeeded, so a failure prints nothing
	const orders = withDb((db) => {
		const orders = takeableOrders(db, roleName);
		// a check that finds an order counts toward no-progress, one that finds none starts again
		db.run(
			"UPDATE roles SET checked_at = ?, checks = CASE WHEN ? THEN checks ELSE CASE WHEN ? THEN checks + 1 ELSE 0 END END WHERE name = ?",
			[stamp, roleName === DUTY_DESK, orders.length > 0, roleName],
		);
		return orders;
	});
	if (orders.length === 0 && roleName !== DUTY_DESK) return EXIT.OK;
	// the time in the first line changes the output at every check, so a monitor never skips work
	return import("./role-entry").then((m) =>
		m.printWake(roleName, stamp, orders),
	);
}
