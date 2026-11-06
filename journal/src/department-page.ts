import { readdirSync } from "node:fs";
import { join } from "node:path";
import { REFERENCES, readText } from "./input-files";
import { commandFolder } from "./launch";
import { lintPage } from "./lint";

// the places of the "Resolve the department page" section, in its order
const PLACES = ["precinct", "installation", "law"] as const;
export type Place = (typeof PLACES)[number];
type InstalledPlace = Exclude<Place, "precinct">;
// the number of a place, as a tick prints it
export const placeNumber = (place: Place) => PLACES.indexOf(place) + 1;

const INSTALLATION_PATHS: Record<InstalledPlace, (d: string) => string> = {
	installation: (d) => join(commandFolder(), "departments", `${d}.md`),
	law: (d) => join(commandFolder(), REFERENCES, "departments", `${d}.md`),
};

// A read of a page at one place. A failed read stops the walk. Its why names the
// cause for a reader that reports it.
export type PageRead =
	| { kind: "page"; text: string }
	| { kind: "none" }
	| { kind: "failed"; why?: string };
export type InstalledRead = (place: InstalledPlace) => PageRead;

// an installation file that cannot be read counts as no page there
export const installationRead =
	(d: string): InstalledRead =>
	(place) => {
		const text = readText(INSTALLATION_PATHS[place](d));
		return text === null ? { kind: "none" } : { kind: "page", text };
	};

export type Page = { text: string; place: Place };

// The page of the first place that has one, or the failed read that stopped the
// walk. precinct reads the precinct place; installed reads the other two.
export async function pageAt(
	precinct: () => Promise<PageRead>,
	installed: InstalledRead,
): Promise<{ kind: "page"; page: Page } | Exclude<PageRead, { kind: "page" }>> {
	for (const place of PLACES) {
		const r = place === "precinct" ? await precinct() : installed(place);
		if (r.kind === "failed") return r;
		if (r.kind === "page")
			return { kind: "page", page: { text: r.text, place } };
	}
	return { kind: "none" };
}

// The department page with its page check, as the duty desk and the clerk read it.
export async function departmentPage(
	d: string,
	precinct: () => Promise<PageRead>,
	installed: InstalledRead = installationRead(d),
) {
	const found = await pageAt(precinct, installed);
	return found.kind === "page"
		? { ...found, lint: lintPage("department", found.page.text, d) }
		: found;
}

// The shared department pages of the law, by file name. A failed listing throws.
export function listSharedPages(): string[] {
	try {
		return readdirSync(join(commandFolder(), REFERENCES, "departments"), {
			withFileTypes: true,
		})
			.filter((e) => e.isFile() && e.name.endsWith(".md"))
			.map((e) => e.name.slice(0, -".md".length))
			.sort();
	} catch (e) {
		throw new Error(
			`shared department pages: the listing failed: ${(e as Error).message}`,
		);
	}
}

// The department names of a precinct: the shared pages, then the constitution
// lines, each at its first place.
export const departmentNames = (shared: string[], constitution: string[]) => [
	...new Set([...shared, ...constitution]),
];
