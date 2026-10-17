import { describe, expect, test } from "bun:test";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { Fail } from "./db";
import { answerLine, requestLine } from "./jev";
import { cli, dir, ROOT, tempDb } from "./test-helpers";

const FIXTURES = join(ROOT, "src", "fixtures", "jev");
const RECORDED = join(FIXTURES, "replies.json");
const fixture = (name: string) => readFileSync(join(FIXTURES, name), "utf8");
const compact = (name: string) =>
	`${JSON.stringify(JSON.parse(fixture(name)))}\n`;

type Run = (kind: string, stdin: string) => Output;
type Output = { code: number | null; out: string; err: string };

const inProcess =
	(command: (args: string[], text: string) => string): Run =>
	(kind, stdin) => {
		try {
			return { code: 0, out: `${command(["--kind", kind], stdin)}\n`, err: "" };
		} catch (e) {
			if (!(e instanceof Fail)) throw e;
			return { code: e.code, out: "", err: `journal: ${e.message}\n` };
		}
	};
const throughCli =
	(sub: string): Run =>
	(kind, stdin) =>
		cli(["jev", sub, "--kind", kind], {}, stdin);

const RUNNERS: [string, Run, Run][] = [
	["cli", throughCli("request"), throughCli("answer")],
	["in process", inProcess(requestLine), inProcess(answerLine)],
];
const request = throughCli("request");
const bodyOf = (kind: string) =>
	JSON.parse(request(kind, fixture(`brief.${kind}.txt`)).out);

const lines = (text: string) => text.trimEnd().split("\n");
const fail = (message: string) => ({
	code: 1,
	out: "",
	err: `journal: ${message}\n`,
});

describe.each(RUNNERS)("jev request (%s)", (_name, request) => {
	test.each(["p0", "grade"])("the %s brief gives the exact body", (kind) => {
		expect(request(kind, fixture(`brief.${kind}.txt`))).toEqual({
			code: 0,
			out: compact(`request.${kind}.json`),
			err: "",
		});
	});

	test("the body keys are model, state, questions in that order", () => {
		for (const kind of ["p0", "grade"])
			expect(Object.keys(bodyOf(kind))).toEqual([
				"model",
				"state",
				"questions",
			]);
		expect(bodyOf("p0").model).toBe("jev-latest");
	});

	test("the p0 questions are three Nouls in the order of the contract", () => {
		const { questions } = bodyOf("p0");
		expect(Object.keys(questions)).toEqual([
			"live_secret",
			"vulnerability",
			"serious_violation",
		]);
		for (const q of Object.values(
			questions as Record<string, { type: string }>,
		))
			expect(q.type).toBe("noul");
	});

	test("the grade questions are one Score then three Nouls", () => {
		const { questions } = bodyOf("grade");
		expect(Object.keys(questions)).toEqual([
			"level",
			"harm_users",
			"harm_maintainers",
			"cosmetic_only",
		]);
		expect(questions.level).toEqual({
			type: "score",
			instructions: "Which situation describes `brief` best?",
			criteria: [
				"Cosmetic, or of small value: only wording, a comment, a note or how something looks is off, and nothing anyone does goes wrong.",
				"The default: a real defect in what the code or the project does or promises, that harms no user or maintainer now.",
				"Harm to users or maintainers now.",
			],
		});
	});

	test("the field order is canonical whatever the input order", () => {
		for (const kind of ["p0", "grade"]) {
			const reversed = lines(fixture(`brief.${kind}.txt`))
				.reverse()
				.join("\n");
			expect(request(kind, reversed).out).toBe(compact(`request.${kind}.json`));
		}
	});

	test("blank lines, CRLF and padding around a line are dropped", () => {
		const messy = lines(fixture("brief.grade.txt"))
			.map((l) => `  ${l}  `)
			.join("\r\n\r\n");
		expect(request("grade", messy).out).toBe(compact("request.grade.json"));
	});

	test("no body holds a P0 to P3 token", () => {
		for (const kind of ["p0", "grade"])
			expect(request(kind, fixture(`brief.${kind}.txt`)).out).not.toMatch(
				/P[0-3]/,
			);
	});

	describe("rejections", () => {
		const grade = lines(fixture("brief.grade.txt"));
		const without = (name: string) =>
			grade.filter((l) => !l.startsWith(`${name}:`)).join("\n");

		test("an unknown field names the field", () => {
			expect(request("grade", `${grade.join("\n")}\nseverity: high\n`)).toEqual(
				fail("brief field severity is not a grade field"),
			);
		});

		test("a duplicate field names the field", () => {
			expect(request("grade", `${grade.join("\n")}\ndefect: again\n`)).toEqual(
				fail("brief field defect appears twice"),
			);
		});

		test("a missing field names the field", () => {
			expect(request("grade", without("effect_today"))).toEqual(
				fail("brief field effect_today is missing"),
			);
		});

		test("a field of the other kind is unknown", () => {
			expect(request("grade", `${grade.join("\n")}\nsecret: x\n`)).toEqual(
				fail("brief field secret is not a grade field"),
			);
		});

		test("a wrapped value names the line number and never the text", () => {
			const wrapped = `${grade[0]}\nSECRETWORD wrapped\n${grade.slice(1).join("\n")}`;
			const r = request("grade", wrapped);
			expect(r).toEqual(fail("brief line 2 is not name: value"));
			expect(r.err).not.toContain("SECRETWORD");
		});

		test("a field with no value does not match", () => {
			expect(request("grade", "defect:\n")).toEqual(
				fail("brief line 1 is not name: value"),
			);
		});

		test("empty input misses the first field", () => {
			expect(request("p0", "")).toEqual(fail("brief field defect is missing"));
		});

		test("a bad or missing kind is a usage error that never echoes it", () => {
			const usage =
				"journal: usage: journal jev <request|answer> --kind <p0|grade>\n";
			const bad = request("P0-secret-kind", "");
			expect(bad).toEqual({ code: 1, out: "", err: usage });
			expect(bad.err).not.toContain("secret-kind");
		});
	});
});

describe("law consistency", () => {
	const law = lines(readFileSync(join(ROOT, "law", "LAW.md"), "utf8"));
	const lawText = (p: string) => {
		const prefix = `- ${p}: `;
		const line = law.find((l) => l.startsWith(prefix)) ?? "";
		return line.slice(prefix.length);
	};
	const capital = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;

	test("each p0 Noul instruction holds its phrase of the law's P0 line", () => {
		const phrases = lawText("P0")
			.replace(/\.$/, "")
			.split(/, | or /);
		expect(phrases).toHaveLength(3);
		const { questions } = bodyOf("p0");
		for (const [i, id] of [
			"live_secret",
			"vulnerability",
			"serious_violation",
		].entries())
			expect(questions[id].instructions).toContain(phrases[i] as string);
	});

	test("Score levels 0 and 2 carry the law's P3 and P1 texts", () => {
		const { criteria } = bodyOf("grade").questions.level;
		expect(criteria[0]).toStartWith(capital(lawText("P3")).replace(/\.$/, ":"));
		expect(criteria[2]).toBe(capital(lawText("P1")));
		expect(criteria[1]).toContain("default");
	});

	test("the grade Nouls hold the words of the law", () => {
		const { questions } = bodyOf("grade");
		const text = (id: string) => JSON.stringify(questions[id]);
		expect(text("harm_users")).toContain("users");
		expect(text("harm_maintainers")).toContain("maintainers");
		expect(text("cosmetic_only")).toContain("wording");
	});

	test("the tick alarm line carries the text of the contract", () => {
		const tick = lines(readFileSync(join(ROOT, "law", "tick.md"), "utf8"));
		expect(tick).toContain(
			"- An issue role prints a critical condition as `ALARM case <p>#<n> <one line>`. A critical condition is a live secret, a vulnerability or a serious violation.",
		);
	});
});

describe.each(RUNNERS)("jev answer (%s)", (_name, _request, answer) => {
	const P0_LINE =
		"jev model=jev-1.13.0 kind=p0 live_secret=0.95 vulnerability=0.12 serious_violation=0.80";
	const GRADE_LINE =
		"jev model=jev-1.13.0 kind=grade P1=0.15 P2=0.75 P3=0.10 harm_users=0.04 harm_maintainers=0.07 cosmetic_only=0.90";
	const NONE = "jev none reason=";
	type Tree = Record<string, unknown>;
	const reply = (name: string): Tree => JSON.parse(fixture(name));
	const with200 = (body: unknown) => `${JSON.stringify(body)}\n200`;
	const line = (text: string) => ({ code: 0, out: `${text}\n`, err: "" });

	function edited(base: string, path: string[], value?: unknown) {
		const copy = structuredClone(reply(base));
		let node = copy;
		for (const key of path.slice(0, -1)) node = node[key] as Tree;
		const last = path.at(-1) as string;
		if (value === undefined) Reflect.deleteProperty(node, last);
		else node[last] = value;
		return with200(copy);
	}
	const p0 = (path: string[], value?: unknown) =>
		edited("reply.p0.json", path, value);
	const grade = (path: string[], value?: unknown) =>
		edited("reply.grade.json", path, value);

	test("a docs-shaped 200 gives the exact line", () => {
		expect(answer("p0", with200(reply("reply.p0.json")))).toEqual(
			line(P0_LINE),
		);
		expect(answer("grade", with200(reply("reply.grade.json")))).toEqual(
			line(GRADE_LINE),
		);
	});

	test("a CR after the status and a blank line after the body are fine", () => {
		const body = JSON.stringify(reply("reply.p0.json"));
		expect(answer("p0", `${body}\n\n200\r`)).toEqual(line(P0_LINE));
	});

	test.each([
		["0.615", "0.61"],
		["0.995", "0.99"],
		["0.3", "0.30"],
		["1", "1.00"],
		["-0", "0.00"],
		["-0.001", "0.00"],
		["1.5", "1.50"],
	])("%s prints as %s", (raw, shown) => {
		const text = JSON.stringify(reply("reply.p0.json")).replace("0.95", raw);
		expect(answer("p0", `${text}\n200`).out).toBe(
			`${P0_LINE.replace("live_secret=0.95", `live_secret=${shown}`)}\n`,
		);
	});

	test.each<[string, string, string, string]>([
		["a 401", "p0", "{}\n401", `${NONE}status-401`],
		["a 500 with CR", "p0", "oops\n500\r", `${NONE}status-500`],
		["status 000", "p0", "\n000", `${NONE}no-reply`],
		["empty stdin", "p0", "", `${NONE}no-reply`],
		["a tail abc", "p0", "{}\nabc", `${NONE}no-reply`],
		["a tail 20O", "p0", "{}\n20O", `${NONE}no-reply`],
		["a four digit tail", "p0", "{}\n2000", `${NONE}no-reply`],
		["a bare 200", "p0", "200", `${NONE}bad-answer`],
		["a root null", "p0", "null\n200", `${NONE}bad-answer`],
		["a root array", "p0", "[]\n200", `${NONE}bad-answer`],
		["non-JSON", "p0", "oops\n200", `${NONE}bad-answer`],
		[
			"a missing answer",
			"p0",
			p0(["answers", "vulnerability"]),
			`${NONE}bad-answer`,
		],
		["a missing answers map", "p0", p0(["answers"]), `${NONE}bad-answer`],
		[
			"a non-finite number",
			"p0",
			`${JSON.stringify(reply("reply.p0.json")).replace("0.95", "1e999")}\n200`,
			`${NONE}bad-answer`,
		],
		[
			"a string number",
			"p0",
			p0(["answers", "live_secret", "noul"], "0.95"),
			`${NONE}bad-answer`,
		],
		[
			"a missing Score level",
			"grade",
			grade(["answers", "level"]),
			`${NONE}bad-answer`,
		],
		[
			"a missing level probability",
			"grade",
			grade(["answers", "level", "probabilities", "1"]),
			`${NONE}bad-answer`,
		],
		["a numeric model", "p0", p0(["model"], 12), `${NONE}bad-answer`],
		[
			"a model with a trailing newline",
			"p0",
			p0(["model"], "jev-1.13.0\n"),
			`${NONE}bad-answer`,
		],
		[
			"a model of 41 characters",
			"p0",
			p0(["model"], "m".repeat(41)),
			`${NONE}bad-answer`,
		],
	])("%s gives its line", (_name, kind, stdin, expected) => {
		expect(answer(kind, stdin)).toEqual(line(expected));
	});

	test("answers beyond the expected ones are ignored", () => {
		const extra = p0(["answers", "extra"], { type: "noul", noul: "x" });
		expect(answer("p0", extra)).toEqual(line(P0_LINE));
	});

	test("a bad kind is a usage error that never echoes it", () => {
		const r = answer("nope", "\n401");
		expect(r.code).toBe(1);
		expect(r.out).toBe("");
		expect(r.err).not.toContain("nope");
	});

	test.skipIf(!existsSync(RECORDED))(
		"every recorded reply gives a line that starts with jev model=",
		() => {
			const recorded = JSON.parse(readFileSync(RECORDED, "utf8")) as {
				kind: string;
				reply: unknown;
			}[];
			for (const { kind, reply: body } of recorded)
				expect(answer(kind, with200(body)).out).toStartWith("jev model=");
		},
	);
});

describe("jev through the journal", () => {
	const USAGE_ERR =
		"journal: usage: journal jev <request|answer> --kind <p0|grade>\n";
	const NO_DB = { LAWMAN_DB: "/nonexistent/dir/journal.sqlite" };

	test("a missing kind or subcommand is a usage error", () => {
		const usage = { code: 1, out: "", err: USAGE_ERR };
		const brief = fixture("brief.p0.txt");
		expect(cli(["jev", "request"], {}, brief)).toEqual(usage);
		expect(cli(["jev", "answer"], {}, "\n401")).toEqual(usage);
		expect(cli(["jev", "frobnicate"])).toEqual(usage);
		expect(cli(["jev"])).toEqual(usage);
	});

	test("neither subcommand opens the database", () => {
		const brief = fixture("brief.grade.txt");
		expect(cli(["jev", "request", "--kind", "grade"], NO_DB, brief).code).toBe(
			0,
		);
		expect(cli(["jev", "answer", "--kind", "p0"], NO_DB, "\n401").code).toBe(0);
	});
});

describe("the Send block of the court skill", () => {
	const DUMMY = "dummy-key-not-a-real-secret";
	const DELIMITER = "LAWMAN_TEST";
	const FAKE_CURL = `#!/bin/bash
: > "$FAKE_DIR/argv"
for a in "$@"; do printf '%s\\n' "$a" >> "$FAKE_DIR/argv"; done
prev=
for a in "$@"; do
	if [ "$prev" = -H ] && [ "\${a#@}" != "$a" ]; then cat "\${a#@}" >> "$FAKE_DIR/headers"; fi
	prev=$a
done
cat > "$FAKE_DIR/body"
if [ "$FAKE_EXIT" != 0 ]; then printf '\\n000'; exit "$FAKE_EXIT"; fi
cat "$FAKE_DIR/reply"
printf '\\n%s' "$FAKE_STATUS"
`;

	const skill = readFileSync(join(ROOT, "skills", "court", "SKILL.md"), "utf8");
	const block = (skill.split(/^## Send$/m)[1] ?? "").split("```")[1] ?? "";
	const script = block.slice(block.indexOf("bash -c '") + "bash -c '".length);

	tempDb();
	const made = (name: string) => join(dir, name);
	const saw = (name: string) =>
		existsSync(made(name)) ? readFileSync(made(name), "utf8") : null;

	function send(
		key: string | null,
		opts: { brief?: string; status?: string; exit?: number } = {},
	) {
		const bin = made("bin");
		mkdirSync(bin);
		writeFileSync(
			join(bin, "journal"),
			`#!/bin/sh\nexec bun ${join(ROOT, "src", "journal.ts")} "$@"\n`,
		);
		writeFileSync(join(bin, "curl"), FAKE_CURL);
		chmodSync(join(bin, "journal"), 0o755);
		chmodSync(join(bin, "curl"), 0o755);
		writeFileSync(made("reply"), compact("reply.grade.json"));
		const command = block
			.replace("<p0|grade>", "grade")
			.replace("<brief, one name: value line per field>", () =>
				(opts.brief ?? fixture("brief.grade.txt")).trimEnd(),
			)
			.replaceAll("<delimiter>", DELIMITER);
		const r = Bun.spawnSync(["bash", "-c", command], {
			cwd: dir,
			env: {
				PATH: `${bin}:${process.env.PATH ?? ""}`,
				...(key === null ? {} : { TYPESAFE_API_KEY: key }),
				FAKE_DIR: dir,
				FAKE_STATUS: opts.status ?? "200",
				FAKE_EXIT: String(opts.exit ?? 0),
			},
		});
		return { code: r.exitCode, out: r.stdout.toString() };
	}

	test("the first fenced block under the heading holds the command", () => {
		expect(script).toStartWith("set +x\n");
		expect(block).toContain("https://api.typesafe.ai/v1/systemone");
	});

	test("the block is untraced: no pipefail, set -x, -v or --trace", () => {
		for (const banned of ["pipefail", "set -x", " -v", "--trace"])
			expect(block).not.toContain(banned);
	});

	test("the key value never reaches curl's arguments", () => {
		send(DUMMY);
		expect(saw("argv")).not.toBeNull();
		expect(saw("argv")).not.toContain(DUMMY);
	});

	test("the header file holds the Bearer line", () => {
		send(DUMMY);
		expect(saw("headers")).toBe(`Authorization: Bearer ${DUMMY}\n`);
	});

	test("the body is the request JSON of the brief", () => {
		send(DUMMY);
		expect(JSON.parse(saw("body") ?? "null")).toEqual(
			JSON.parse(fixture("request.grade.json")),
		);
	});

	test("a docs-shaped 200 prints the jev model line", () => {
		expect(send(DUMMY)).toEqual({
			code: 0,
			out: "jev model=jev-1.13.0 kind=grade P1=0.15 P2=0.75 P3=0.10 harm_users=0.04 harm_maintainers=0.07 cosmetic_only=0.90\n",
		});
	});

	test.each([
		["unset", null],
		["empty", ""],
	])("the %s key prints no-key and never calls curl", (_name, key) => {
		expect(send(key)).toEqual({ code: 0, out: "jev none reason=no-key\n" });
		expect(saw("argv")).toBeNull();
	});

	test("a brief the journal rejects prints reason=brief", () => {
		const brief = `${fixture("brief.grade.txt")}extra_field: x\n`;
		expect(send(DUMMY, { brief })).toEqual({
			code: 0,
			out: "jev none reason=brief\n",
		});
		expect(saw("argv")).toBeNull();
	});

	test("a 401 prints reason=status-401", () => {
		expect(send(DUMMY, { status: "401" })).toEqual({
			code: 0,
			out: "jev none reason=status-401\n",
		});
	});

	test("a connection failure prints reason=no-reply", () => {
		expect(send(DUMMY, { exit: 7 })).toEqual({
			code: 0,
			out: "jev none reason=no-reply\n",
		});
	});
});
