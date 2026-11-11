import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Code, Root } from "mdast";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { sectionsOf } from "./law-sections";
import { LAW } from "./test-helpers";

const PAGE = readFileSync(join(LAW, "harnesses", "openclaw.md"), "utf8");
const ROLE = "patrol";

// the one block tagged javascript in the Role entry section; any other count fails
function scriptOf(page: string): string {
	const [lines] = sectionsOf(page, ["Role entry"]);
	if (lines === null || lines === undefined)
		throw new Error("the page has no Role entry section");
	const blocks: Code[] = [];
	visit(
		unified().use(remarkParse).parse(lines.join("\n")) as Root,
		"code",
		(node) => {
			if (node.lang === "javascript") blocks.push(node);
		},
	);
	if (blocks.length !== 1)
		throw new Error(`Role entry holds ${blocks.length} javascript blocks`);
	return blocks[0]?.value ?? "";
}

type Reply = Record<string, unknown>;
type Outcome = { value: unknown } | { error: string };

// runs the trigger script in Bun with `exec` replaced; the replies are given in turn
async function run(reply: Reply, role = ROLE) {
	const calls: unknown[] = [];
	const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
	const script = new AsyncFunction(
		"exec",
		scriptOf(PAGE).replaceAll("<role>", role),
	);
	const exec = async (args: unknown) => {
		calls.push(args);
		return reply;
	};
	const outcome: Outcome = await script(exec).then(
		(value: unknown) => ({ value }),
		(e: Error) => ({ error: e.message }),
	);
	return { calls, outcome };
}

const errorOf = async (reply: Reply) => {
	const { outcome } = await run(reply);
	if (!("error" in outcome)) throw new Error("the script did not throw");
	return outcome.error;
};

describe("the OpenClaw trigger script", () => {
	test("calls the journal once, for the role, and waits for the answer", async () => {
		const { calls } = await run({
			status: "completed",
			exitCode: 0,
			aggregated: "",
		});
		expect(calls).toEqual([
			{ command: `bin/journal wake --role ${ROLE}`, awaitResults: true },
		]);
	});

	test.each(["", " ", "\n", " \n\t\n"])(
		"row 1: a blank output %p does not start the turn",
		async (aggregated) => {
			const { outcome } = await run({
				status: "completed",
				exitCode: 0,
				aggregated,
			});
			expect(outcome).toEqual({ value: { fire: false } });
		},
	);

	test.each([
		`lawman input 1 role=${ROLE} at=T part 1 of 1\nend part 1 of 1\n`,
		"  padded  \n",
		"hello",
		"first line is not the input line\nlawman input 1\n",
	])(
		"row 2 and a first line that is not the input line: the output %p starts the turn as it is",
		async (aggregated) => {
			const { outcome } = await run({
				status: "completed",
				exitCode: 0,
				aggregated,
			});
			expect(outcome).toEqual({ value: { fire: true, message: aggregated } });
		},
	);

	test.each([1, 2, 137, null])(
		"row 3: exit code %p throws with the role and the code",
		async (exitCode) => {
			const message = await errorOf({
				status: "completed",
				exitCode,
				aggregated: "x",
			});
			expect(message).toContain(ROLE);
			expect(message).toContain(String(exitCode));
		},
	);

	test.each(["failed", "running", "approval-pending", "approval-unavailable"])(
		"row 4: status %p throws with the role and the status",
		async (status) => {
			const message = await errorOf({ status, exitCode: 0, aggregated: "x" });
			expect(message).toContain(ROLE);
			expect(message).toContain(status);
		},
	);

	test("row 5: a missing output field throws", async () => {
		const message = await errorOf({ status: "completed", exitCode: 0 });
		expect(message).toContain(ROLE);
	});

	test("takes the role from the placeholder, every time it stands", async () => {
		const { calls, outcome } = await run(
			{ status: "completed", exitCode: 3 },
			"duty-desk",
		);
		expect(calls).toEqual([
			{ command: "bin/journal wake --role duty-desk", awaitResults: true },
		]);
		expect(outcome).toEqual({
			error: expect.stringContaining("duty-desk"),
		});
	});
});

describe("the Role entry section of the OpenClaw page", () => {
	const [lines] = sectionsOf(PAGE, ["Role entry"]);

	test("names the size of a part", () => {
		expect(lines).toContain("input_chars: 15000");
	});
});
