import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./test-helpers";

const SHELLS = "bash|sh|zsh|ksh|dash";
const INTERPRETERS = "python3?|node|bun|perl|ruby";

// The harness page lists these forms as refused in scheduled runs. Keep this
// list equal to the page's refused lists. It does not cover every refused form.
const REFUSED: [string, RegExp][] = [
	[
		"a shell started with -c",
		new RegExp(`\\b(?:${SHELLS})\\b[^|;&\\n]*\\s-[a-zA-Z]*c\\b`),
	],
	[
		"an interpreter started with -c or -e",
		new RegExp(`\\b(?:${INTERPRETERS})\\s+-[ec]\\b`),
	],
	[
		"a heredoc fed to a shell or an interpreter",
		new RegExp(`\\b(?:${SHELLS}|${INTERPRETERS})\\s+<<`),
	],
];

describe("command forms in the law, the skills and the department pages", () => {
	const files = ["law", "skills", "departments", ".lawman"].flatMap((d) =>
		readdirSync(join(ROOT, d), { encoding: "utf8", recursive: true })
			.filter((f) => f.endsWith(".md"))
			.map((f) => join(ROOT, d, f)),
	);
	for (const [name, form] of REFUSED) {
		test(`no ${name}`, () => {
			const hits: string[] = [];
			for (const file of files)
				readFileSync(file, "utf8")
					.split("\n")
					.forEach((line, i) => {
						if (form.test(line))
							hits.push(`${file.slice(ROOT.length + 1)}:${i + 1}`);
					});
			expect(hits).toEqual([]);
		});
	}
});
