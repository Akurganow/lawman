import { check, parseArgs } from "./args";
import { now, out, withDb } from "./db";
import { takeableOrders } from "./dispatch";

const DAY_LENGTH = "YYYY-MM-DD".length;

export function wake(args: string[]): void {
	const { opt } = parseArgs(args, 0, ["role"], "wake --role <r>");
	const roleName = check("role", opt.role);
	const stamp = now();
	// stdout is written only after every database step succeeded, so a failure never prints idle
	const orders = withDb((db) => {
		const orders = takeableOrders(db, roleName, stamp);
		db.run("UPDATE roles SET checked_at = ? WHERE name = ?", [stamp, roleName]);
		return orders;
	});
	if (orders.length === 0) {
		out("idle");
		return;
	}
	for (const o of orders) out(`order ${o.id}`);
	out(`day ${stamp.slice(0, DAY_LENGTH)}`);
}
