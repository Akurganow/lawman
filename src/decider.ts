import { check, usage } from "./args";
import { EXIT, Fail, out, readStdin } from "./db";

const DECIDING = new Set(["ADMIN", "MAINTAIN", "WRITE"]);
const NO_ACTOR = "-";

const reject = (why: string) =>
	new Fail(EXIT.SYNC_INPUT, `decider input rejected: ${why}`);

type Obj = Record<string, unknown>;

function obj(value: unknown, what: string): Obj {
	if (typeof value !== "object" || value === null || Array.isArray(value))
		throw reject(`${what} is not an object`);
	return value as Obj;
}

function list(value: unknown, what: string): unknown[] {
	if (!Array.isArray(value)) throw reject(`${what} is not a list`);
	return value;
}

function lastActor(item: Obj): string | undefined {
	const nodes = list(
		obj(item.timelineItems, "timelineItems").nodes,
		"timeline nodes",
	);
	const event = nodes.at(-1);
	if (event === undefined) return undefined;
	const actor = obj(event, "timeline event").actor ?? null;
	if (actor === null) return undefined;
	const login = obj(actor, "actor").login;
	if (typeof login !== "string") throw reject("actor login is not a string");
	return login;
}

function deciders(repository: Obj): Set<string> {
	const collaborators = obj(repository.collaborators, "collaborators");
	if (obj(collaborators.pageInfo, "pageInfo").hasNextPage !== false)
		throw reject("collaborators span more than one page");
	const logins = new Set<string>();
	for (const entry of list(collaborators.edges, "collaborator edges")) {
		const edge = obj(entry, "collaborator edge");
		const login = obj(edge.node, "collaborator").login;
		if (typeof login !== "string") throw reject("collaborator login missing");
		if (DECIDING.has(String(edge.permission))) logins.add(login.toLowerCase());
	}
	return logins;
}

function classChecked(login: string): string {
	try {
		return check("login", login);
	} catch {
		throw reject(`actor login is not a valid login: ${JSON.stringify(login)}`);
	}
}

export function decide(raw: string): string {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw reject("not JSON");
	}
	const root = obj(parsed, "response");
	if ("errors" in root) throw reject("the response carries errors");
	const repository = obj(obj(root.data, "data").repository, "repository");
	const actor = lastActor(obj(repository.issueOrPullRequest, "item"));
	const allowed = deciders(repository);
	if (actor === undefined) return `decider=no actor=${NO_ACTOR}`;
	const login = classChecked(actor);
	return `decider=${allowed.has(login.toLowerCase()) ? "yes" : "no"} actor=${login}`;
}

export function decider(args: string[]): void {
	if (args.length > 0) throw usage("decider < response.json");
	out(decide(readStdin()));
}
