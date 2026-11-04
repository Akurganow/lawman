import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { issuesJson, type Spec } from "./cases-fixture";
import { CONFIG, installation, lines } from "./input-test-fixture";
import { command, configs } from "./operations-test-fixture";
import { hostPulls, type Pull } from "./pulls-fixture";
import {
	AT,
	BASE,
	call,
	JOURNAL,
	LEAD_ID,
	order,
	precinct,
	SHA,
	seed,
	TRUSTED,
} from "./test-helpers";

export const PAGES = join(JOURNAL, "src", "fixtures", "pages");
export const CONSTITUTION = readFileSync(
	join(PAGES, "constitution-valid.md"),
	"utf8",
);
// the department page of the fixtures, under the name the tests give it
export const departmentPage = (name: string) =>
	readFileSync(join(PAGES, "department-valid.md"), "utf8").replace(
		"name: fixtures",
		`name: ${name}`,
	);

export const leadIn = (department: string, role = "patrol") =>
	`<!-- lawman: role=${role} stage=lead department=${department} id=${LEAD_ID} sha=${SHA} ${AT} -->`;

type Host = {
	login?: string;
	issues?: Record<number, Spec>;
	pulls?: Pull[];
	tree?: Record<string, string>;
};

// The commands of the precinct main: the host and the tree they read.
export function host(h: Host = {}): void {
	const place = configs("main");
	command(place, "identity", `echo ${h.login ?? TRUSTED}`);
	command(place, "fetch", `echo ${SHA}`);
	mkdirSync(place, { recursive: true });
	writeFileSync(join(place, "issues.json"), issuesJson(h.issues ?? {}));
	writeFileSync(
		join(place, "pulls.json"),
		JSON.stringify(hostPulls(h.pulls ?? [], [TRUSTED, "maint-a"])),
	);
	command(place, "issues", "cat issues.json");
	command(place, "pulls", "cat pulls.json");
	for (const [path, text] of Object.entries(
		h.tree ?? { "LAWMAN.md": CONSTITUTION },
	)) {
		mkdirSync(dirname(join(place, "tree", path)), { recursive: true });
		writeFileSync(join(place, "tree", path), text);
	}
	mkdirSync(join(place, "tree"), { recursive: true });
	command(place, "files", "cd tree && find . -type f | sed 's|^\\./||' | sort");
	command(place, "file", 'cat "tree/$2"');
}

export function setUp(config: string | null = CONFIG): void {
	installation(config);
	seed((d) => precinct(d, "main"));
}

export const orderOf = (
	role: string,
	f: { issue?: number; department?: string } = {},
) => seed((d) => order(d, "main", role, f));

export const start = (role: string, id = 1, clock = BASE) =>
	call(clock, ["tick", "start", "--role", role, "--order", String(id)]);
export const input = (...args: string[]) =>
	call(BASE, ["tick", "input", ...args]);

// the journal's lines and the label of each fence, the fenced text left out
export function skeleton(out: string): string[] {
	const kept: string[] = [];
	let fence: string | null = null;
	for (const line of lines(out)) {
		if (fence !== null) {
			if (line === fence) fence = null;
			continue;
		}
		const open = /^(~{3,})([a-z]+)$/.exec(line);
		if (open !== null) {
			fence = open[1] ?? null;
			kept.push(line.replace(/^~+/, "~"));
			continue;
		}
		const summary = /^(issues|pulls)=/.exec(line)?.[1];
		kept.push(
			summary ?? (line.startsWith("need=") ? (line.split(" ")[0] ?? "") : line),
		);
	}
	return kept;
}
