export const MARKER_MAX_BYTES = 1024;

export type Fields = {
	role: string;
	stage: string;
	at: string;
	[key: string]: string;
};
export type Marker = {
	role: string;
	stage: string;
	fields: Fields;
	raw: string;
};
export type Found = { ord: string; line: number; marker: Marker };
type Carrier = {
	text: string;
	createdAt: string;
	rank: number;
	author: string;
};
type GhAuthor = { login: string } | null;
export type GhIssue = {
	number: number;
	author: GhAuthor;
	body: string;
	createdAt: string;
	comments: { author: GhAuthor; body: string; createdAt: string }[];
};

const KEY_VALUE = "[a-z][a-z0-9_]*=[A-Za-z0-9.:_/%+-]+";
const MARKER_LINE = new RegExp(
	`^<!-- lawman: (${KEY_VALUE}(?: ${KEY_VALUE})*) -->$`,
);
export const NAME = /^[a-z][a-z0-9-]*$/;
const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const POSITIVE = /^[1-9][0-9]*$/;
const SHA_HEX = /^[0-9a-f]{40}$/;
const ID_SAFE_BYTE = /[A-Za-z0-9._/-]/;
const ID_PART = /^(?:[A-Za-z0-9._/-]|%[0-9A-F]{2})+$/;
const ID_PARTS = 3;
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})\s*$/;
const ORD_PAD = 6;
const LEGACY_FORMS: {
	prefix: (m: RegExpMatchArray) => string;
	re: RegExp;
	role: (m: RegExpMatchArray) => string;
	value: number;
}[] = [
	{
		re: /^<!-- police-fingerprint: (\S+) (.+?) -->$/,
		prefix: () => "police-fingerprint",
		role: (m) => m[1] ?? "",
		value: 2,
	},
	{
		re: /^<!-- (?!police-fingerprint)(\S+)-fingerprint: (.+?) -->$/,
		prefix: (m) => `${m[1]}-fingerprint`,
		role: (m) => m[1] ?? "",
		value: 2,
	},
	{
		re: /^<!-- repo-audit-routine:(.+?) -->$/,
		prefix: () => "repo-audit-routine",
		role: () => "repo",
		value: 1,
	},
];
const POLICE_SUFFIX = /-police$/;
const DEPARTMENT_RENAMES: Record<string, string> = {
	abstraction: "abstractions",
	slop: "text-residue",
	sanity: "proportion",
	repo: "claims",
	test: "tests",
	dependency: "dependencies",
	agent: "agent-config",
};

function encodeBytes(bytes: Uint8Array): string {
	const text = Array.from(bytes, (b) => {
		const ch = String.fromCharCode(b);
		return ID_SAFE_BYTE.test(ch)
			? ch
			: `%${b.toString(16).toUpperCase().padStart(2, "0")}`;
	}).join("");
	return text.replace(/-{2,}/g, (run) => `-${"%2D".repeat(run.length - 1)}`);
}

function decodeBytes(part: string): Uint8Array | null {
	if (!ID_PART.test(part)) return null;
	const bytes = Uint8Array.from(part.matchAll(/%([0-9A-F]{2})|./g), (m) =>
		m[1] ? parseInt(m[1], 16) : m[0].charCodeAt(0),
	);
	return encodeBytes(bytes) === part ? bytes : null;
}

export function encodeIdPart(bytes: string): string {
	return encodeBytes(new TextEncoder().encode(bytes));
}

// a canonical part that holds bytes outside UTF-8 has no string form
export function decodeIdPart(part: string): string | null {
	const bytes = decodeBytes(part);
	if (bytes === null) return null;
	try {
		return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
			bytes,
		);
	} catch {
		return null;
	}
}

export function canonicalId(id: string): boolean {
	const parts = id.split("::");
	return (
		parts.length === ID_PARTS && parts.every((p) => decodeBytes(p) !== null)
	);
}

function readFields(body: string): Record<string, string> | null {
	const fields: Record<string, string> = {};
	for (const pair of body.split(" ")) {
		const eq = pair.indexOf("=");
		const key = pair.slice(0, eq);
		if (Object.hasOwn(fields, key)) return null;
		fields[key] = pair.slice(eq + 1);
	}
	return fields;
}

const LEAD_ROLES = ["patrol", "response-unit"];

const matches = (re: RegExp, value: string | undefined) =>
	value !== undefined && re.test(value);

function validLead(f: Record<string, string>): boolean {
	return (
		LEAD_ROLES.includes(f.role ?? "") &&
		f.department !== undefined &&
		f.id !== undefined &&
		matches(SHA_HEX, f.sha) &&
		(f.of === undefined || POSITIVE.test(f.of))
	);
}

function validFields(f: Record<string, string>): f is Fields {
	const { role, stage, at } = f;
	if (role === undefined || stage === undefined || at === undefined)
		return false;
	if (!NAME.test(role) || !NAME.test(stage) || !STAMP.test(at)) return false;
	if (
		Object.entries(f).some(
			([k, v]) => v.includes("--") || (k !== "id" && v.includes("::")),
		)
	)
		return false;
	if (f.id !== undefined && !canonicalId(f.id)) return false;
	if (stage === "lead") return validLead(f);
	return (
		f.stage !== "return" || (matches(NAME, f.to) && matches(POSITIVE, f.round))
	);
}

export function parseMarker(line: string): Marker | null {
	if (Buffer.byteLength(line) > MARKER_MAX_BYTES) return null;
	const shape = line.match(MARKER_LINE);
	const fields = shape && readFields(shape[1] ?? "");
	if (!fields || !validFields(fields)) return null;
	return { role: fields.role, stage: fields.stage, fields, raw: line };
}

// the legacy fingerprint lines are read only: nobody writes them any more
function parseLegacy(line: string, createdAt: string): Marker | null {
	if (Buffer.byteLength(line) > MARKER_MAX_BYTES) return null;
	for (const form of LEGACY_FORMS) {
		const m = line.match(form.re);
		if (!m) continue;
		const stripped = form.role(m).replace(POLICE_SUFFIX, "");
		const department = DEPARTMENT_RENAMES[stripped] ?? stripped;
		if (!NAME.test(department)) return null;
		const value = m[form.value] ?? "";
		return {
			role: "patrol",
			stage: "lead",
			fields: {
				role: "patrol",
				stage: "lead",
				department,
				...(canonicalId(value) ? { id: value } : {}),
				legacy: form.prefix(m),
				at: createdAt,
			},
			raw: line,
		};
	}
	return null;
}

function openingFence(line: string): string | null {
	const m = line.match(FENCE_OPEN);
	if (!m) return null;
	const [, fence = "", rest = ""] = m;
	return fence.startsWith("`") && rest.includes("`") ? null : fence;
}

function closesFence(line: string, fence: string): boolean {
	const m = line.match(FENCE_CLOSE);
	if (!m) return false;
	const [, close = ""] = m;
	return close.charAt(0) === fence.charAt(0) && close.length >= fence.length;
}

// String.toLowerCase also folds non-ASCII letters, and logins are ASCII
export const asciiLower = (s: string) =>
	s.replace(/[A-Z]/g, (c) => c.toLowerCase());

const pad = (n: number) => String(n).padStart(ORD_PAD, "0");

export const stripCr = (line: string) =>
	line.endsWith("\r") ? line.slice(0, -1) : line;

// true for fence delimiters and every line between them; an unclosed fence runs to the end
export function fencedLines(lines: string[]): boolean[] {
	let fence: string | null = null;
	return lines.map((line) => {
		if (fence !== null) {
			if (closesFence(line, fence)) fence = null;
			return true;
		}
		fence = openingFence(line);
		return fence !== null;
	});
}

export function extractMarkers(
	carrier: Carrier,
	trustedLogin: string,
): Found[] {
	if (
		trustedLogin === "" ||
		asciiLower(carrier.author) !== asciiLower(trustedLogin)
	)
		return [];
	const lines = carrier.text.split("\n").map(stripCr);
	const hidden = fencedLines(lines);
	const found: Found[] = [];
	lines.forEach((line, i) => {
		const marker = hidden[i]
			? null
			: (parseMarker(line) ?? parseLegacy(line, carrier.createdAt));
		if (marker)
			found.push({
				ord: `${carrier.createdAt}|${pad(carrier.rank)}|${pad(i + 1)}`,
				line: i + 1,
				marker,
			});
	});
	return found;
}

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function collectIssueMarkers(issue: GhIssue, trustedLogin: string) {
	const comments = [...issue.comments].sort((a, b) =>
		byText(a.createdAt, b.createdAt),
	);
	const markers = [issue, ...comments]
		.flatMap((c, rank) =>
			extractMarkers(
				{
					text: c.body ?? "",
					createdAt: c.createdAt,
					rank,
					author: c.author?.login ?? "",
				},
				trustedLogin,
			),
		)
		.sort((a, b) => byText(a.ord, b.ord));
	return {
		markers,
		leadOrigin: markers.find((m) => m.marker.stage === "lead") ?? null,
		newestByRole: new Map(markers.map((m) => [m.marker.role, m])),
	};
}
