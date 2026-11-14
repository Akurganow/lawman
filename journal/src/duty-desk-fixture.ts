import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import {
	handed,
	human,
	issuesJson,
	type Spec,
	withLead,
} from "./cases-fixture";
import { CONFIG, installation, lines } from "./input-test-fixture";
import {
	command,
	configs,
	RECORDS,
	recording,
} from "./operations-test-fixture";
import { hostPulls, type Pull, SPEC } from "./pulls-fixture";
import {
	BASE,
	call,
	caseMark,
	charge,
	defence,
	rows,
	SHA,
	seed,
	TRUSTED,
} from "./test-helpers";
import {
	CONSTITUTION,
	departmentPage,
	leadIn,
} from "./tick-start-test-fixture";

export { leadIn };

export type Host = {
	login?: string;
	issues?: Record<number, Spec>;
	pulls?: Pull[];
	// the tree at the fetched revision; by default the constitution and a page for its first department
	tree?: Record<string, string>;
	// every command writes the fact of its start beside itself
	record?: boolean;
};

export const PAGE = ".lawman/departments/abstraction.md";
export const TREE = {
	"LAWMAN.md": CONSTITUTION,
	[PAGE]: departmentPage("abstraction"),
};

// The commands of one precinct: the host and the tree they read.
export function hostOf(name: string, h: Host = {}): void {
	const place = configs(name);
	const run = (op: string, body: string) =>
		command(place, op, h.record ? recording(body) : body);
	run("identity", `echo ${h.login ?? TRUSTED}`);
	run("fetch", `echo ${SHA}`);
	writeFileSync(join(place, "issues.json"), issuesJson(h.issues ?? {}));
	writeFileSync(join(place, "pulls.json"), pullsJson(h.pulls));
	run("issues", "cat issues.json");
	run("pulls", "cat pulls.json");
	rmSync(join(place, "tree"), { recursive: true, force: true });
	mkdirSync(join(place, "tree"), { recursive: true });
	for (const [path, text] of Object.entries(h.tree ?? TREE)) {
		mkdirSync(dirname(join(place, "tree", path)), { recursive: true });
		writeFileSync(join(place, "tree", path), text);
	}
	run("files", "cd tree && find . -type f | sed 's|^\\./||' | sort");
	run("file", 'cat "tree/$2"');
}

export const pullsJson = (pulls: Pull[] = []) =>
	JSON.stringify(hostPulls(pulls, [TRUSTED, "maint-a"]));

// a command that fails, or one the host does not have
export const failing = (name: string, op: string) =>
	command(configs(name), op, "exit 1");
export const without = (name: string, ...ops: string[]) => {
	for (const op of ops) rmSync(join(configs(name), op), { force: true });
};

// the operations that started at a precinct, in order
export const started = (name: string): string[] => {
	const file = join(configs(name), RECORDS);
	return existsSync(file)
		? readFileSync(file, "utf8")
				.trim()
				.split("\n")
				.map((p) => basename(p))
		: [];
};

// what the model does itself after a self step: the sync of the cache from the host
export function syncBy(name: string, h: Host, clock = BASE, pulls = false) {
	const args = pulls ? ["--pulls"] : [];
	return call(
		clock,
		["sync", name, ...args, "--author", TRUSTED],
		pulls ? pullsJson(h.pulls) : issuesJson(h.issues ?? {}),
	);
}

export { CONFIG };

// Precincts by weight, each with a host that has no work. The installation brings the law.
export function setUp(
	weights: Record<string, number> = { main: 1 },
	config: string | null = CONFIG,
): void {
	installation(config);
	seed((d) => {
		for (const [name, weight] of Object.entries(weights))
			d.run("INSERT INTO precincts (name, repo, weight) VALUES (?, ?, ?)", [
				name,
				`o/${name}`,
				weight,
			]);
	});
	for (const name of Object.keys(weights)) hostOf(name);
}

export const DESK = ["tick", "start", "--role", "duty-desk"];
export const startDesk = (clock = BASE) => call(clock, DESK);
export const proceed = (id: number | string = 1, clock = BASE) =>
	call(clock, ["tick", "continue", String(id)]);

export const ticks = () =>
	rows("SELECT id, role, outcome, ended_at, report FROM ticks ORDER BY id");
export const dispatches = () =>
	rows(
		"SELECT id, precinct, role, department, issue, taken_at, outcome, closed_at FROM dispatches ORDER BY id",
	);
export const openOrders = () =>
	rows(
		"SELECT precinct, role, department, issue FROM dispatches WHERE outcome IS NULL ORDER BY id",
	);

export const orderLines = (out: string) =>
	lines(out).filter((l) => l.startsWith("order "));
export const reportOf = (out: string, label: string) =>
	lines(out)
		.find((l) => l.startsWith(`report ${label}:`))
		?.slice("report ".length);

// the cases of one precinct that give each role of the cases and the pull requests one order
export const WORK: Host = {
	issues: {
		1: withLead(),
		2: withLead(caseMark()),
		3: withLead(caseMark(), charge()),
		4: withLead(caseMark(), charge(), defence()),
		5: human("OPEN"),
		6: handed(7),
		7: handed(8),
		8: human("OPEN"),
	},
	pulls: [
		{ number: 7, author: TRUSTED, closes: [6] },
		{
			number: 8,
			author: TRUSTED,
			closes: [7],
			comments: [{ body: SPEC, author: TRUSTED, up: ["maint-a"] }],
		},
		// left by the old pipeline, so the clerk adopts it
		{
			number: 9,
			author: TRUSTED,
			closes: [5],
			body: "<!-- pipeline-work-fingerprint: old-work sources=#5 -->",
		},
	],
};
