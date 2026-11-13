import { check, usage } from "./args";
import { out, readStdin } from "./db";
import { inputRejected, isRecord, loginList, text, timeOf } from "./form";
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

export type CheckComment = {
	// empty when the account is gone
	author: string;
	createdAt: string;
	body: string;
};

export type CheckObject = {
	actor: string | null;
	writers: string[];
	comments: CheckComment[];
};

function readComment(c: unknown): CheckComment {
	if (!isRecord(c)) throw reject("a comment is not an object");
	return {
		author: text(c.author),
		createdAt: timeOf(c.createdAt, "a comment createdAt", reject),
		body: text(c.body),
	};
}

function readCommon(raw: string) {
	let root: unknown;
	try {
		root = JSON.parse(raw);
	} catch {
		throw reject("not JSON");
	}
	if (!isRecord(root)) throw reject("the input is not an object");
	const { lastActor, writers } = root;
	const allowed = loginList(writers, "writers", reject);
	if (lastActor === null) return { root, actor: null, allowed };
	if (typeof lastActor !== "string")
		throw reject("lastActor is neither a login nor null");
	return { root, actor: classChecked(lastActor), allowed };
}

export function decide(raw: string): string {
	const { actor, allowed } = readCommon(raw);
	if (actor === null) return `decider=no actor=${NO_ACTOR}`;
	return `decider=${allowed.includes(asciiLower(actor)) ? "yes" : "no"} actor=${actor}`;
}

export function readCheckObject(raw: string): CheckObject {
	const { root, actor, allowed } = readCommon(raw);
	const { comments } = root;
	if (comments !== undefined && !Array.isArray(comments))
		throw reject("comments is not a list");
	return {
		actor,
		writers: allowed,
		comments: (comments ?? []).map(readComment),
	};
}

export function decider(args: string[]): void {
	if (args.length > 0) throw usage("decider < response.json");
	out(decide(readStdin()));
}
