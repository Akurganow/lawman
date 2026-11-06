import { expect, spyOn } from "bun:test";
import * as fs from "node:fs";
import { issuesJson, T } from "./cases-fixture";
import { EXIT } from "./db";
import { inprocAsync } from "./inproc";
import { BASE, lead, TRUSTED } from "./test-helpers";

export type Comment = { body: string; author?: string };

// readStdin reads file descriptor 0, so the test answers that read
export const cache = (...issues: (string | Comment)[][]) =>
	cacheWith([lead()], ...issues);

// the issues with one body and these comments
export async function cacheWith(
	body: string[],
	...issues: (string | Comment)[][]
) {
	const json = JSON.parse(
		issuesJson(
			Object.fromEntries(
				issues.map((comments, k) => [
					k + 1,
					{
						body,
						comments: comments.map((c, i): [string, string] => [
							T(10 + i),
							typeof c === "string" ? c : c.body,
						]),
					},
				]),
			),
		),
	);
	issues.forEach((comments, k) => {
		comments.forEach((c, i) => {
			if (typeof c !== "string" && c.author !== undefined)
				json.issues[k].comments[i].author = { login: c.author };
		});
	});
	const spy = spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify(json));
	try {
		const r = await inprocAsync(BASE, ["sync", "main", "--author", TRUSTED]);
		expect(r.code).toBe(EXIT.OK);
	} finally {
		spy.mockRestore();
	}
}
