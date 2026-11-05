import type { TextKind } from "./cache-text";

// The blocks of each role's input: what its skill reads or runs at the start.
// A section is named by its heading without the # signs. INTRO is the text
// before the first second-level heading, WHOLE the whole file. The sections of
// a file stand in the order of the document, so a missing one keeps its place.

export const INTRO = "intro";
export const WHOLE = "";
type Read = [file: string, sections: string[]];
type Sync = "issues" | "pulls";
type StageKind = "case" | "intake" | "pull";
// the fields a stale rule reads from a stage function's structure
export type StageFields = { need: string; state: string };

export type RoleInput = {
	law: Read[];
	number: "issue" | "pull" | "department";
	sync: Sync[];
	stage: StageKind | null;
	// absent for a role without a stage
	stale?: (s: StageFields) => boolean;
	constitution: boolean;
	department: "order" | "stage" | null;
	// whose department picks the precedents: all of them, the order's, the stage's, or none
	precedents: "all" | "order" | "stage" | null;
	texts: TextKind[];
};

export const HARNESS_SECTIONS = ["Silence"];

// the sections of tick.md in the order of the document
export const TICK_ORDER = [
	INTRO,
	"One end",
	"Sync the law",
	"Sync the law with an older journal",
	"Working rules",
	"Reading without a tree",
	"Instructions and evidence",
	"Fetch the precinct",
	"Sync the tracker",
	"Sync the pull requests",
	"Read the stage",
	"Check the decider",
	"Read the pull stage",
	"Check the intake order",
	"Check the constitution",
	"Resolve the department page",
	"Write a comment",
	"Close the issue",
	"End the tick",
	"Alarm",
];
const EVERY_ROLE = [
	INTRO,
	"One end",
	"Sync the law",
	"Working rules",
	"Instructions and evidence",
	"Fetch the precinct",
	"End the tick",
];

const law = (tick: string[], extra: Read[] = []): Read[] => [
	["LAW.md", [WHOLE]],
	[
		"tick.md",
		TICK_ORDER.filter((s) => EVERY_ROLE.includes(s) || tick.includes(s)),
	],
	...extra,
];

const closed = (s: StageFields) => s.state === "CLOSED";
const notOpen = (s: StageFields) => s.state !== "OPEN";
const needNot = (need: string) => (s: StageFields) => s.need !== need;
const either =
	(...rules: ((s: StageFields) => boolean)[]) =>
	(s: StageFields) =>
		rules.some((rule) => rule(s));

const CASE_STEPS = [
	"Sync the tracker",
	"Read the stage",
	"Check the constitution",
	"Write a comment",
	"Alarm",
];
const CLOSING_STEPS = [
	...CASE_STEPS,
	"Reading without a tree",
	"Close the issue",
];
const JUDGING_STEPS = [...CLOSING_STEPS, "Resolve the department page"];
const PULL_STEPS = [
	"Sync the pull requests",
	"Read the pull stage",
	"Check the constitution",
	"Write a comment",
];

type Shared = Omit<RoleInput, "law" | "stale">;
const ISSUE_ROLE: Shared = {
	number: "issue",
	sync: ["issues"],
	stage: "case",
	constitution: true,
	department: null,
	precedents: "all",
	texts: ["issue"],
};
const PULL_ROLE: Shared = {
	number: "pull",
	sync: ["pulls"],
	stage: "pull",
	constitution: true,
	department: null,
	precedents: "all",
	texts: ["pull"],
};

export const ROLES: Record<string, RoleInput> = {
	patrol: {
		law: law(
			[
				"Sync the tracker",
				"Check the constitution",
				"Resolve the department page",
				"Alarm",
			],
			[
				["markers.md", [WHOLE]],
				["departments.md", [WHOLE]],
			],
		),
		number: "department",
		sync: ["issues"],
		stage: null,
		constitution: true,
		department: "order",
		precedents: "order",
		texts: [],
	},
	"response-unit": {
		...ISSUE_ROLE,
		law: law(
			[
				"Sync the tracker",
				"Check the intake order",
				"Check the constitution",
				"Reading without a tree",
				"Write a comment",
				"Alarm",
			],
			[["markers.md", ["The `id` value"]]],
		),
		stage: "intake",
		stale: either((s) => s.need === "none", closed),
		precedents: "stage",
	},
	investigation: {
		...ISSUE_ROLE,
		law: law(CASE_STEPS),
		stale: either(needNot("investigation"), closed),
		precedents: "stage",
	},
	prosecutor: {
		...ISSUE_ROLE,
		law: law(CLOSING_STEPS),
		stale: either(needNot("prosecutor"), closed),
	},
	defender: {
		...ISSUE_ROLE,
		law: law(JUDGING_STEPS),
		stale: either(needNot("defender"), notOpen),
		department: "stage",
	},
	court: {
		...ISSUE_ROLE,
		law: law(JUDGING_STEPS),
		stale: either(needNot("court"), notOpen),
		department: "stage",
	},
	clerk: {
		...ISSUE_ROLE,
		law: law([
			"Sync the tracker",
			"Sync the pull requests",
			"Read the stage",
			"Check the decider",
			"Write a comment",
			"Close the issue",
			"Alarm",
		]),
		sync: ["issues", "pulls"],
		stale: needNot("clerk"),
		constitution: false,
		precedents: null,
		texts: ["issue", "pull"],
	},
	"spec-writer": {
		...PULL_ROLE,
		law: law([...PULL_STEPS, "Reading without a tree"]),
		stale: needNot("spec-writer"),
	},
	executor: {
		...PULL_ROLE,
		law: law(PULL_STEPS),
		stale: needNot("executor"),
	},
};

export const DUTY_DESK = "duty-desk";
const DUTY_DESK_LAW: Read[] = [
	[
		"LAW.md",
		[
			"Silence is the default",
			"One tick, one case, exit",
			"Alarms and their repetition",
			"Tick outcomes",
		],
	],
	[
		"tick.md",
		[INTRO, "Sync the law", "Sync the tracker", "Sync the pull requests"],
	],
];

export const lawOf = (role: string): Read[] =>
	role === DUTY_DESK ? DUTY_DESK_LAW : (inputOf(role)?.law ?? []);

// an own key only, so a role named like an object member has no input
export const inputOf = (role: string): RoleInput | undefined =>
	Object.hasOwn(ROLES, role) ? ROLES[role] : undefined;
