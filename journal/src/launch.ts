import { mkdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { dbPath } from "./db";

export const PRECINCT_OPERATIONS = [
	"fetch",
	"identity",
	"issues",
	"pulls",
	"decider",
	"file",
	"files",
] as const;
export const LAW_VERSION = "law-version";
export const INSTALLATION_OPERATIONS = [
	"release",
	"verify",
	LAW_VERSION,
] as const;

// the folder of the database, so a throwaway database brings its own commands
export const commandFolder = () => resolve(dirname(dbPath()));
export const precinctPlace = (precinct: string) =>
	join(commandFolder(), "configs", precinct);
export const installationPlace = () => join(commandFolder(), "shared");

// a folder, a dangling link or a place that is a file holds no command
export function hasCommand(place: string, operation: string): boolean {
	try {
		return statSync(join(place, operation)).isFile();
	} catch {
		return false;
	}
}

// code is null when a signal ended the file
export type Ran = {
	ok: boolean;
	code: number | null;
	stdout: Uint8Array;
	stderr: Uint8Array;
};

function start(place: string, operation: string, args: string[]) {
	try {
		return Bun.spawn([join(place, operation), ...args], {
			cwd: place,
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
		});
	} catch {
		return null;
	}
}

// The file itself runs, with each argument as one value and no interpreter of
// the journal between. Standard input is closed, so a read of it ends at once.
// Null when the file did not start.
export async function launch(
	place: string,
	operation: string,
	args: string[],
): Promise<Ran | null> {
	const child = start(place, operation, args);
	if (child === null) return null;
	const [stdout, stderr] = await Promise.all([
		new Response(child.stdout).bytes(),
		new Response(child.stderr).bytes(),
		child.exited,
	]);
	return {
		ok: child.exitCode === 0 && child.signalCode === null,
		code: child.signalCode === null ? child.exitCode : null,
		stdout,
		stderr,
	};
}

// strict UTF-8, null for bytes that are not
export function utf8(bytes: Uint8Array): string | null {
	try {
		return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
			bytes,
		);
	} catch {
		return null;
	}
}

// the folder made anew and empty, false when the journal cannot
export function freshFolder(folder: string): boolean {
	try {
		rmSync(folder, { recursive: true, force: true });
		mkdirSync(folder, { recursive: true });
		return true;
	} catch {
		return false;
	}
}

export const lawFolder = () => join(commandFolder(), "lawman");

// The operations of the installation as the update calls them. The proof of a
// command calls the same functions, so the proof and the update cannot drift.
export const runRelease = (
	repo: string,
	tag: string,
	folder: string,
	asset: string,
) => launch(installationPlace(), "release", [repo, tag, folder, asset]);
export const runVerify = (
	asset: string,
	provenance: string,
	repo: string,
	commit: string,
) => launch(installationPlace(), "verify", [asset, provenance, repo, commit]);
export const runLawVersion = () =>
	launch(installationPlace(), LAW_VERSION, [lawFolder()]);
