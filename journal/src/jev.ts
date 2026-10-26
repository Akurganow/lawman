import { parseArgs, pick, subcommand, usage } from "./args";
import { EXIT, Fail, out, readStdin } from "./db";
import { isNoReply, splitReply } from "./reply-status";

const USAGE = "jev <request|answer> --kind <p0|grade|requirement>";
const MODEL = "jev-latest";
const BRIEF_LINE = /^([a-z_]+): (.+)$/;
const ANSWER_MODEL = /^[A-Za-z0-9._-]{1,40}$/;

type Kind = {
	fields: string[];
	questions: Record<string, object>;
	levels: [label: string, level: string][];
};

const noul = (instructions: string, yes: string, no: string) => ({
	type: "noul",
	instructions,
	criteria: { true: yes, false: no },
});

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
	levels: [],
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
	levels: [
		["P1", "2"],
		["P2", "1"],
		["P3", "0"],
	],
};

const REQUIREMENT: Kind = {
	fields: [
		"request",
		"need",
		"value",
		"risk",
		"established",
		"not_established",
	],
	questions: {
		level: {
			type: "score",
			instructions: "Which situation describes `brief` best?",
			criteria: [
				"Small value: the change only tidies wording, comments, documents, names or code structure, or adds an optional extra. Nobody is blocked or misled without it, and nothing anyone does changes.",
				"The default: a wanted addition or change with a clear gain for users or maintainers, who can work without it today.",
				"Harm to users or maintainers now: without the change they are blocked, misled, lose data or work, or must redo work today.",
			],
		},
		harm_now: noul(
			"Does `brief.need` describe a cost that users or maintainers pay today because the change is missing: something they rely on fails or gives a wrong result, or they lose data or work, or they redo work? Not having a feature they never had is no cost.",
			"Something people rely on fails, gives a wrong result, or costs them data or work today.",
			"Nobody pays a cost today. The change adds something new or tidies, and people can work without it.",
		),
		tidy_only: noul(
			"Does `brief.value` describe only a tidier project, in wording, comments, documents, names or code structure, with what users and maintainers do left the same?",
			"Only wording, comments, documents, names or code structure get tidier, and what people do stays the same.",
			"People can do something new, or something bad stops happening to them.",
		),
		clear_gain: noul(
			"Does `brief.value` describe a gain that users or maintainers feel in what they do with the project, beyond a tidier project?",
			"Users or maintainers can do something new, or a bad outcome stops, in their own use of the project.",
			"The gain is a tidier project only, or there is no gain for users or maintainers.",
		),
		harm_if_undone: noul(
			"Does the first sentence of `brief.risk` describe a harm to users or maintainers if the change is never made? A harm is something that fails, gives a wrong result, loses data or work, or goes wrong without anyone noticing.",
			"Leaving the change undone lets a failure, a wrong result, a loss or an unnoticed fault happen to people.",
			"Leaving the change undone harms nobody. The project stays as useful as it is today.",
		),
	},
	levels: GRADE.levels,
};

const KINDS: Record<string, Kind> = {
	p0: P0,
	grade: GRADE,
	requirement: REQUIREMENT,
};

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

const at = (root: unknown, path: string[]) =>
	path.reduce<unknown>(
		(node, key) => (node as Record<string, unknown> | null)?.[key],
		root,
	);

const shown = (n: number) => n.toFixed(2).replace(/^-0\.00$/, "0.00");

function evidence(name: string, kind: Kind, body: string): string {
	const root = JSON.parse(body);
	const model = at(root, ["model"]);
	if (typeof model !== "string" || !ANSWER_MODEL.test(model))
		throw new Error("model is not valid");
	const noulIds = Object.entries(kind.questions)
		.filter(([, q]) => "type" in q && q.type === "noul")
		.map(([id]): [string, string[]] => [id, ["answers", id, "noul"]]);
	const readings = [
		...kind.levels.map(([label, level]): [string, string[]] => [
			label,
			["answers", "level", "probabilities", level],
		]),
		...noulIds,
	];
	const values = readings.map(([label, path]) => {
		const n = at(root, path);
		if (typeof n !== "number" || !Number.isFinite(n))
			throw new Error("not a finite number");
		return `${label}=${shown(n)}`;
	});
	return `jev model=${model} kind=${name} ${values.join(" ")}`;
}

export function answerLine(args: string[], input: string): string {
	const { name, kind } = kindOf(args);
	const none = (reason: string) => `jev none reason=${reason}`;
	const { body, status } = splitReply(input);
	if (isNoReply(status)) return none("no-reply");
	if (status !== "200") return none(`status-${status}`);
	try {
		return evidence(name, kind, body);
	} catch {
		return none("bad-answer");
	}
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
