import { encodeIdPart } from "./markers";

export const UNRESOLVED_VERSION = "-";

// The classes keep foreign lines from shaping a request: ASCII only, no whitespace, control, hidden or quoting bytes.
const MAX_PLACE = 512;
const MAX_ECOSYSTEM = 32;
const MAX_NAME = 214;
const MAX_VERSION = 64;
const MAX_RECORD = 64;

const SEGMENT = /^[A-Za-z0-9._@+-]+$/;
const ECOSYSTEM = new RegExp(
	`^[A-Za-z][A-Za-z0-9._:-]{0,${MAX_ECOSYSTEM - 1}}$`,
);
const NAME = new RegExp(`^[A-Za-z0-9@][A-Za-z0-9._@:/+-]{0,${MAX_NAME - 1}}$`);
const VERSION = new RegExp(
	`^[A-Za-z0-9][A-Za-z0-9._+~:!-]{0,${MAX_VERSION - 1}}$`,
);
const RECORD = new RegExp(`^[A-Za-z0-9][A-Za-z0-9._-]{0,${MAX_RECORD - 1}}$`);
const SOURCE_LINE = /^Source: catalog (\S+) (\S+)$/;

export const isPlace = (v: string) =>
	v.length <= MAX_PLACE &&
	v.split("/").every((s) => s !== "." && s !== ".." && SEGMENT.test(s));
export const isEcosystem = (v: string) => ECOSYSTEM.test(v);
export const isPackageName = (v: string) => NAME.test(v);
export const isVersion = (v: string) => VERSION.test(v);
export const isRecordId = (v: string) => RECORD.test(v);

export type Entry = {
	number: number;
	place: string;
	ecosystem: string;
	name: string;
	version: string;
};

export type ParsedList = {
	entries: Entry[];
	refused: number[];
	unresolved: number[];
};

const FIELD_COUNT = 4;

export function parseList(input: string): ParsedList {
	const parsed: ParsedList = { entries: [], refused: [], unresolved: [] };
	const lines = input.split("\n").filter((line) => line !== "");
	lines.forEach((line, i) => {
		const number = i + 1;
		const fields = line.split("\t");
		const [place = "", ecosystem = "", name = "", version = ""] = fields;
		const identified =
			fields.length === FIELD_COUNT &&
			isPlace(place) &&
			isEcosystem(ecosystem) &&
			isPackageName(name);
		if (!identified) parsed.refused.push(number);
		else if (version === UNRESOLVED_VERSION) parsed.unresolved.push(number);
		else if (!isVersion(version)) parsed.refused.push(number);
		else parsed.entries.push({ number, place, ecosystem, name, version });
	});
	return parsed;
}

// The package token is `<ecosystem>/<name>`. An ecosystem holds no `/`, so the first `/` splits it.
export const packageToken = (ecosystem: string, name: string) =>
	`${ecosystem}/${name}`;

export function splitPackageToken(
	token: string,
): { ecosystem: string; name: string } | null {
	const cut = token.indexOf("/");
	const [ecosystem, name] = [token.slice(0, cut), token.slice(cut + 1)];
	return cut > 0 && isEcosystem(ecosystem) && isPackageName(name)
		? { ecosystem, name }
		: null;
}

export const sourceLine = (id: string, ecosystem: string, name: string) =>
	`Source: catalog ${id} ${packageToken(ecosystem, name)}`;

export function parseSourceLine(
	line: string,
): { id: string; ecosystem: string; name: string } | null {
	const [, id = "", token = ""] = line.match(SOURCE_LINE) ?? [];
	const pkg = splitPackageToken(token);
	return pkg !== null && isRecordId(id) ? { id, ...pkg } : null;
}

export const leadIdentity = (
	place: string,
	id: string,
	ecosystem: string,
	name: string,
) =>
	[
		encodeIdPart(place),
		`${encodeIdPart(id)}/${encodeIdPart(packageToken(ecosystem, name))}`,
		"advisory",
	].join("::");

export const LIST_FORM = `catalog, for catalog request. A list with one entry per line, fields separated by a tab:
  place: the path, relative to the repository, of the file that lists the dependency. No leading "/" or "./", no "." or ".." segment, no empty segment, no trailing "/"
  ecosystem: the ecosystem name as the catalog names it
  package: the package name as the catalog names it
  version: the pinned version, or ${UNRESOLVED_VERSION} when the reading way did not resolve one. An entry with ${UNRESOLVED_VERSION} is not sent
A field has ASCII letters, digits and a few punctuation marks only. A field with whitespace, quotes, backticks or any other byte is refused. The journal names a refused entry by its number, counted from 1 over the non-empty lines, and never prints its text`;

export const LIST_EXAMPLE = [
	["package-lock.json", "npm", "lodash", "4.17.15"],
	["services/api/requirements.txt", "PyPI", "django", "2.2.0"],
	["services/web/Cargo.lock", "crates.io", "smallvec", UNRESOLVED_VERSION],
]
	.map((fields) => fields.join("\t"))
	.join("\n");
