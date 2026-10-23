import { spyOn } from "bun:test";
import { EXIT, Fail } from "./db";
import { main } from "./journal";
import { dbFile } from "./test-helpers";

export type Result = { code: number; out: string; err: string };

function capture(clock: string) {
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
	return {
		result,
		settle(returned: unknown): void {
			if (typeof returned === "number") result.code = returned;
		},
		fail(e: unknown): void {
			result.code = e instanceof Fail ? e.code : -1;
			result.err += e instanceof Error ? e.message : String(e);
		},
		restore(): void {
			stdout.mockRestore();
			stderr.mockRestore();
			for (const [key, value] of Object.entries(saved))
				if (value === undefined) delete process.env[key];
				else process.env[key] = value;
		},
	};
}

// Runs a command in this process, where coverage sees it. Subprocess runs are invisible to coverage.
export function captured(clock: string, body: () => unknown): Result {
	const run = capture(clock);
	try {
		run.settle(body());
	} catch (e) {
		run.fail(e);
	} finally {
		run.restore();
	}
	return run.result;
}

export async function capturedAsync(
	clock: string,
	body: () => unknown,
): Promise<Result> {
	const run = capture(clock);
	try {
		run.settle(await body());
	} catch (e) {
		run.fail(e);
	} finally {
		run.restore();
	}
	return run.result;
}

export const inproc = (clock: string, args: string[]): Result =>
	captured(clock, () => main(args));

export const inprocAsync = (clock: string, args: string[]): Promise<Result> =>
	capturedAsync(clock, () => main(args));
