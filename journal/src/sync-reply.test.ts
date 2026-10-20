import { beforeEach, describe, expect, test } from "bun:test";
import {
	addPrecincts,
	cli,
	dbFile,
	lead,
	must,
	rows,
	TRUSTED,
	tempDb,
} from "./test-helpers";

tempDb();

const PRECINCT = "main";
const sync = (data: unknown) =>
	cli(
		["sync", PRECINCT, "--author", TRUSTED],
		{ LAWMAN_DB: dbFile },
		JSON.stringify(data),
	);

beforeEach(() => addPrecincts({ [PRECINCT]: 1 }));

describe("reply time", () => {
	const AUTHOR = "reporter-fictional";
	const note = (login: string, createdAt: string, body = "reply") => ({
		author: { login },
		body,
		createdAt,
	});
	const repliedAt = (comments: unknown[], author = AUTHOR) => {
		sync([
			{
				number: 60,
				state: "OPEN",
				title: "x",
				createdAt: "2026-10-14T09:00:00Z",
				author: { login: author },
				comments,
			},
		]);
		return must(rows("SELECT replied_at FROM issues")[0]).replied_at;
	};

	test("is the newest comment of the issue author", () => {
		expect(
			repliedAt([
				note(AUTHOR, "2026-10-14T12:00:00Z"),
				note(AUTHOR, "2026-10-14T10:00:00Z"),
			]),
		).toBe("2026-10-14T12:00:00Z");
	});

	test("is null without a comment of the author", () => {
		expect(repliedAt([])).toBeNull();
	});

	test("ignores a comment with a marker line, also after other text", () => {
		expect(
			repliedAt([
				note(AUTHOR, "2026-10-14T10:00:00Z"),
				note(AUTHOR, "2026-10-14T11:00:00Z", `text\n${lead()}`),
			]),
		).toBe("2026-10-14T10:00:00Z");
	});

	test("counts a comment that only mentions the marker prefix mid-line", () => {
		expect(
			repliedAt([
				note(AUTHOR, "2026-10-14T10:00:00Z", "see <!-- lawman: above"),
			]),
		).toBe("2026-10-14T10:00:00Z");
	});

	test("ignores comments of other people, also the trusted login", () => {
		expect(
			repliedAt([
				note(TRUSTED, "2026-10-14T10:00:00Z"),
				note("bystander-fictional", "2026-10-14T11:00:00Z"),
				{ body: "ghost", createdAt: "2026-10-14T12:00:00Z" },
			]),
		).toBeNull();
	});

	test("matches the author without regard to case", () => {
		expect(
			repliedAt([note(AUTHOR.toUpperCase(), "2026-10-14T10:00:00Z")]),
		).toBe("2026-10-14T10:00:00Z");
	});

	test("is recomputed on every sync, so a deleted comment stops counting", () => {
		repliedAt([note(AUTHOR, "2026-10-14T10:00:00Z")]);
		expect(repliedAt([])).toBeNull();
	});
});
