import { spyOn } from "bun:test";
import { EXIT, Fail } from "./db";
import { main } from "./journal";
import { dbFile } from "./test-helpers";

type Result = { code: number; out: string; err: string };

// Runs a command in this process, where coverage sees it. Subprocess runs are invisible to coverage.
export function captured(clock: string, body: () => unknown): Result {
	const saved: Record<string, string | undefined> = {
		LAWMAN_DB: process.env.LAWMAN_DB,
		LAWMAN_NOW: process.env.LAWMAN_NOW,
	};
	process.env.LAWMAN_DB = dbFile;
	process.env.LAWMAN_NOW = clock;
	const result: Result = { code: EXIT.OK, out: "", err: "" };
	const stdout = spyOn(process.stdout, "write").mockImplementation((chunk) => {
		result.out += String(chunk);
		return true;
	});
	const stderr = spyOn(process.stderr, "write").mockImplementation((chunk) => {
		result.err += String(chunk);
		return true;
	});
	try {
		const returned = body();
		if (typeof returned === "number") result.code = returned;
	} catch (e) {
		result.code = e instanceof Fail ? e.code : -1;
		result.err += e instanceof Error ? e.message : String(e);
	} finally {
		stdout.mockRestore();
		stderr.mockRestore();
		for (const [key, value] of Object.entries(saved))
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
	}
	return result;
}

export const inproc = (clock: string, args: string[]): Result =>
	captured(clock, () => main(args));
