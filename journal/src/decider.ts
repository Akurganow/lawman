import { check, usage } from "./args";
import { out, readStdin } from "./db";
import { inputRejected, loginList } from "./form";
import { asciiLower } from "./markers";

const NO_ACTOR = "-";

const reject = (why: string) =>
	inputRejected("decider", `decider input rejected: ${why}`);

function classChecked(login: string): string {
	try {
		return check("login", login);
	} catch {
		throw reject(`lastActor is not a valid login: ${JSON.stringify(login)}`);
	}
}

export function decide(raw: string): string {
	let root: unknown;
	try {
		root = JSON.parse(raw);
	} catch {
		throw reject("not JSON");
	}
	if (typeof root !== "object" || root === null || Array.isArray(root))
		throw reject("the input is not an object");
	const { lastActor, writers } = root as Record<string, unknown>;
	const allowed = loginList(writers, "writers", reject);
	if (lastActor === null) return `decider=no actor=${NO_ACTOR}`;
	if (typeof lastActor !== "string")
		throw reject("lastActor is neither a login nor null");
	const login = classChecked(lastActor);
	return `decider=${allowed.includes(asciiLower(login)) ? "yes" : "no"} actor=${login}`;
}

export function decider(args: string[]): void {
	if (args.length > 0) throw usage("decider < response.json");
	out(decide(readStdin()));
}
