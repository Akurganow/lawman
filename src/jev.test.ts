import { describe, expect, spyOn, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as db from "./db";
import { Fail } from "./db";
import { captured } from "./inproc";
import { answerLine, jev, requestLine } from "./jev";
import { cli, LAW, ROOT } from "./test-helpers";

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

		test("a wrapped value names the line number and never the text", () => {
			const wrapped = `${grade[0]}\nSECRETWORD wrapped\n${grade.slice(1).join("\n")}`;
			const r = request("grade", wrapped);
			expect(r).toEqual(fail("brief line 2 is not name: value"));
			expect(r.err).not.toContain("SECRETWORD");
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
	const law = lines(readFileSync(join(LAW, "LAW.md"), "utf8"));
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

	test("the tick alarm line carries the text in the law", () => {
		const tick = lines(readFileSync(join(LAW, "tick.md"), "utf8"));
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

	test("every recorded reply gives a line that starts with jev model=", () => {
		const recorded = JSON.parse(readFileSync(RECORDED, "utf8")) as {
			kind: string;
			reply: unknown;
		}[];
		for (const { kind, reply: body } of recorded)
			expect(answer(kind, with200(body)).out).toStartWith("jev model=");
	});
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

	test("both subcommands read stdin and print one line", () => {
		const stdin = spyOn(db, "readStdin");
		stdin.mockReturnValueOnce(fixture("brief.p0.txt"));
		const asked = captured("2026-01-01T00:00:00Z", () =>
			jev(["request", "--kind", "p0"]),
		);
		expect(asked.out).toBe(
			`${requestLine(["--kind", "p0"], fixture("brief.p0.txt"))}\n`,
		);
		stdin.mockReturnValueOnce("\n401");
		const answered = captured("2026-01-01T00:00:00Z", () =>
			jev(["answer", "--kind", "p0"]),
		);
		expect(answered.out).toBe("jev none reason=status-401\n");
		stdin.mockRestore();
	});

	test("neither subcommand opens the database", () => {
		const brief = fixture("brief.grade.txt");
		expect(cli(["jev", "request", "--kind", "grade"], NO_DB, brief).code).toBe(
			0,
		);
		expect(cli(["jev", "answer", "--kind", "p0"], NO_DB, "\n401").code).toBe(0);
	});
});
