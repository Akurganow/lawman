import { describe, expect, test } from "bun:test";
import { isNoReply, splitReply } from "./reply-status";

describe("splitReply", () => {
	test.each([
		["body\n200", "body", "200"],
		["body\n200\n", "body", "200"],
		["a\nb\r\n503\r\n", "a\nb\r", "503"],
		["200", "", "200"],
		["no status line", "", "no status line"],
		["", "", ""],
	])(
		"%j splits into the reply above and the status line",
		(input, body, status) => {
			expect(splitReply(input)).toEqual({ body, status });
		},
	);
});

describe("isNoReply", () => {
	test.each([
		["000", true],
		["", true],
		["20", true],
		["2000", true],
		["abc", true],
		["200", false],
		["503", false],
	])("%j is %p", (status, expected) => {
		expect(isNoReply(status)).toBe(expected);
	});
});
