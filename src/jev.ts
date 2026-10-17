import { parseArgs, pick, subcommand, usage } from "./args";
import { EXIT, Fail, out, readStdin } from "./db";

const USAGE = "jev <request|answer> --kind <p0|grade>";
const MODEL = "jev-latest";
const BRIEF_LINE = /^([a-z_]+): (.+)$/;
const ANSWER_MODEL = /^[A-Za-z0-9._-]{1,40}$/;
const STATUS = /^[0-9]{3}$/;
const OK_STATUS = "200";
const NO_STATUS = "000";

type Noul = {
	type: "noul";
	instructions: string;
	criteria: { true: string; false: string };
};
type Score = { type: "score"; instructions: string; criteria: string[] };
type Reading = [label: string, path: string[]];
type Kind = {
	fields: string[];
	questions: Record<string, Noul | Score>;
	readings: Reading[];
};

const noul = (instructions: string, yes: string, no: string): Noul => ({
	type: "noul",
	instructions,
	criteria: { true: yes, false: no },
});

const noulAt = (id: string): Reading => [id, ["answers", id, "noul"]];
const levelAt = (label: string, level: string): Reading => [
	label,
	["answers", "level", "probabilities", level],
];

const P0: Kind = {
	fields: [
		"defect",
		"secret",
		"weakness",
		"rule",
		"established",
		"not_established",
	],
	questions: {
		live_secret: noul(
			"Does `brief.secret` describe a live secret, a working credential that people outside its intended holders can read?",
			"A working credential that outsiders can read.",
			"No credential is involved, or it is a placeholder, an example or a dead credential, or only its intended holders can read it.",
		),
		vulnerability: noul(
			"Does `brief.weakness` describe a vulnerability, a weakness that an outsider can use to gain access, run code or reach other people's data?",
			"An outsider can use it to gain access, run code or reach others' data.",
			"No weakness is described, or only a maintainer can use it, or it gains nothing of that kind.",
		),
		serious_violation: noul(
			"Does `brief.rule` describe a serious violation, a breach that exposes the project, its users or their data to outsiders, or lets outsiders control what the project does?",
			"The breach exposes the project, its users or their data to outsiders, or hands outsiders control.",
			"No rule is broken, or the breach touches only wording, process or convenience inside the project.",
		),
	},
	readings: ["live_secret", "vulnerability", "serious_violation"].map(noulAt),
};

const GRADE: Kind = {
	fields: ["defect", "effect_today", "established", "not_established"],
	questions: {
		level: {
			type: "score",
			instructions: "Which situation describes `brief` best?",
			criteria: [
				"Cosmetic, or of small value: only wording, a comment, a note or how something looks is off, and nothing anyone does goes wrong.",
				"The default: a real defect in what the code or the project does or promises, that harms no user or maintainer now.",
				"Harm to users or maintainers now.",
			],
		},
		harm_users: noul(
			"Does `brief.effect_today` describe harm to users now?",
			"Users get a wrong result, lose data, are blocked or are misled today.",
			"Users notice no bad outcome today.",
		),
		harm_maintainers: noul(
			"Does `brief.effect_today` describe harm to maintainers now?",
			"Maintainers are blocked, misled or made to redo work today, for example by a failing build.",
			"Maintainers notice no bad outcome today.",
		),
		cosmetic_only: noul(
			"Does `brief.defect` concern only wording, comments or appearance, with what the code does left the same?",
			"Only wording, comments or appearance are off, and behaviour is the same.",
			"What the code does, or what users or maintainers rely on, is affected.",
		),
	},
	readings: [
		levelAt("P1", "2"),
		levelAt("P2", "1"),
		levelAt("P3", "0"),
		...["harm_users", "harm_maintainers", "cosmetic_only"].map(noulAt),
	],
};

const KINDS: Record<string, Kind> = { p0: P0, grade: GRADE };

const reject = (why: string) => new Fail(EXIT.USAGE, why);

function parseBrief(
	text: string,
	name: string,
	kind: Kind,
): Record<string, string> {
	const found = new Map<string, string>();
	text.split("\n").forEach((raw, i) => {
		const line = raw.trim();
		if (line === "") return;
		const [, field, value] = line.match(BRIEF_LINE) ?? [];
		if (field === undefined || value === undefined)
			throw reject(`brief line ${i + 1} is not name: value`);
		if (!kind.fields.includes(field))
			throw reject(`brief field ${field} is not a ${name} field`);
		if (found.has(field)) throw reject(`brief field ${field} appears twice`);
		found.set(field, value);
	});
	const brief: Record<string, string> = {};
	for (const field of kind.fields) {
		const value = found.get(field);
		if (value === undefined) throw reject(`brief field ${field} is missing`);
		brief[field] = value;
	}
	return brief;
}

function kindOf(args: string[]): { name: string; kind: Kind } {
	const { opt } = parseArgs(args, 0, ["kind"], USAGE);
	const kind = pick(KINDS, opt.kind);
	if (kind === undefined) throw usage(USAGE);
	return { name: opt.kind, kind };
}

export function requestLine(args: string[], text: string): string {
	const { name, kind } = kindOf(args);
	const brief = parseBrief(text, name, kind);
	return JSON.stringify({
		model: MODEL,
		state: { brief },
		questions: kind.questions,
	});
}

function finite(root: unknown, path: string[]): number {
	let node = root;
	for (const key of path) {
		if (typeof node !== "object" || node === null || !Object.hasOwn(node, key))
			throw new Error("missing");
		node = (node as Record<string, unknown>)[key];
	}
	if (typeof node !== "number" || !Number.isFinite(node))
		throw new Error("not a finite number");
	return node;
}

const shown = (n: number) => n.toFixed(2).replace(/^-0\.00$/, "0.00");

function evidence(name: string, kind: Kind, body: string): string {
	const root: unknown = JSON.parse(body);
	if (typeof root !== "object" || root === null || Array.isArray(root))
		throw new Error("root is not an object");
	const model = (root as Record<string, unknown>).model;
	if (typeof model !== "string" || !ANSWER_MODEL.test(model))
		throw new Error("model is not valid");
	const values = kind.readings.map(
		([label, path]) => `${label}=${shown(finite(root, path))}`,
	);
	return `jev model=${model} kind=${name} ${values.join(" ")}`;
}

const none = (reason: string) => `jev none reason=${reason}`;

function reply(name: string, kind: Kind, input: string): string {
	const cut = input.lastIndexOf("\n");
	const tail = input.slice(cut + 1).replace(/\r$/, "");
	if (!STATUS.test(tail) || tail === NO_STATUS) return none("no-reply");
	if (tail !== OK_STATUS) return none(`status-${tail}`);
	try {
		return evidence(name, kind, input.slice(0, Math.max(cut, 0)));
	} catch {
		return none("bad-answer");
	}
}

export function answerLine(args: string[], input: string): string {
	const { name, kind } = kindOf(args);
	return reply(name, kind, input);
}

export function jev(args: string[]): void {
	const { run, rest } = subcommand(
		{
			request: (more: string[]) => requestLine(more, readStdin()),
			answer: (more: string[]) => answerLine(more, readStdin()),
		},
		args,
		USAGE,
	);
	out(run(rest));
}
