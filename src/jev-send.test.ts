import { describe, expect, test } from "bun:test";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { dir, ROOT, tempDb } from "./test-helpers";

const FIXTURES = join(ROOT, "src", "fixtures", "jev");
const fixture = (name: string) => readFileSync(join(FIXTURES, name), "utf8");

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
		writeFileSync(made("reply"), fixture("reply.grade.json"));
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
		expect(block).toContain("bash -c 'set +x\n");
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
