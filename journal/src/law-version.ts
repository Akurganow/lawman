import { join } from "node:path";
import { commandFolder, hasCommand, installationPlace, launch } from "./launch";
import { configValue } from "./law-sync";

export const LAW_VERSION = "law-version";
export const COMMIT = /^[0-9a-f]{40}$/;
export const DRIFT = "stopped-law-drift";
export const DIRTY = "stopped-dirty-law";
export const UNSAFE = "a value is not safe";
export const DIRTY_REASON = "the law folder has a local change";
export const COMMAND_FAILED = "the law-version command failed";
const FORM =
	/^revision=([^\r\n]*)\r?\nchanged=(yes|no)\r?\ntag=([^\r\n]*)\r?\n$/;

export type LawFacts = { revision: string; changed: boolean; tag: string };
export type Stop = { outcome: string; report: string };

export const lawFolder = () => join(commandFolder(), "lawman");
// "absent" when the installation has no law-version file, null when the file
// did not start, failed, or printed outside the form
export async function lawVersion(): Promise<LawFacts | "absent" | null> {
	if (!hasCommand(installationPlace(), LAW_VERSION)) return "absent";
	const ran = await launch(installationPlace(), LAW_VERSION, [lawFolder()]);
	if (ran === null || !ran.ok) return null;
	let text: string;
	try {
		text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
			ran.stdout,
		);
	} catch {
		return null;
	}
	const m = text.match(FORM);
	if (m === null) return null;
	return { revision: m[1] ?? "", changed: m[2] === "yes", tag: m[3] ?? "" };
}

// The check of the law folder at the start of every tick. "self" when the
// role reads the facts itself, null when the folder is at law_commit.
export async function lawCheck(config: string): Promise<Stop | "self" | null> {
	const commit = configValue(config, "law_commit");
	if (commit === undefined)
		return { outcome: "failed", report: "config.yaml has no law_commit" };
	const facts = await lawVersion();
	if (facts === "absent") return "self";
	if (facts === null) return { outcome: DRIFT, report: COMMAND_FAILED };
	if (!COMMIT.test(facts.revision) || !COMMIT.test(commit))
		return { outcome: DRIFT, report: UNSAFE };
	if (facts.changed) return { outcome: DIRTY, report: DIRTY_REASON };
	if (facts.revision !== commit)
		return { outcome: DRIFT, report: "the law folder is not at law_commit" };
	return null;
}
