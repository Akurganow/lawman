import { fits } from "./args";
import { readFrontmatter } from "./lint";
import { canonicalId, stripCr } from "./markers";

export const DISMISSAL = "dismissal";
// the kinds of a numbered line; a dismissal has no such line
export const PRECEDENT_KINDS = ["protects", "condemns"];
export const HEADER_KINDS = [...PRECEDENT_KINDS, DISMISSAL];
export const NO_VALUE = "-";

// departments is null when the value is outside its class; finding and issue are absent then too
export type Header = {
	kind: string;
	departments: string[] | null;
	finding?: string;
	issue?: number;
};
export type Fields = {
	kind: string;
	departments: string[];
	issue?: number;
	date: string;
	finding?: string;
	ruling?: string;
};

// the header lines as written and the text after them; null without a closed header
export function splitPrecedent(
	text: string,
): { header: string; body: string } | null {
	const raw = text.split("\n");
	const end = readFrontmatter(raw.map(stripCr))?.end;
	if (end === undefined) return null;
	return {
		header: raw.slice(0, end).join("\n"),
		body: raw.slice(end).join("\n"),
	};
}

function parsed(text: string): Record<string, unknown> | null {
	const lines = text.split("\n").map(stripCr);
	const end = readFrontmatter(lines)?.end;
	if (end === undefined) return null;
	try {
		const value: unknown = Bun.YAML.parse(lines.slice(1, end - 1).join("\n"));
		return typeof value === "object" && value !== null && !Array.isArray(value)
			? (value as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}

// the file comes from the precinct clone, so a value is used only inside its class
export function headerOf(text: string): Header {
	const h = parsed(text);
	const kind = h?.kind;
	const departments = h?.departments;
	const finding = h?.finding;
	const issue = h?.issue;
	return {
		kind:
			typeof kind === "string" && HEADER_KINDS.includes(kind) ? kind : NO_VALUE,
		departments:
			Array.isArray(departments) &&
			departments.every((d) => typeof d === "string" && fits("department", d))
				? (departments as string[])
				: null,
		...(typeof finding === "string" && canonicalId(finding) ? { finding } : {}),
		...(typeof issue === "number" && Number.isSafeInteger(issue) && issue > 0
			? { issue }
			: {}),
	};
}

export const departmentsField = (d: string[] | null) =>
	d === null ? NO_VALUE : d.join(",") || "all";

// an empty list, a list outside its class and an unknown department all serve every department
export const serves = (d: string[] | null, department: string) =>
	d === null ||
	d.length === 0 ||
	department === NO_VALUE ||
	d.includes(department);

export const buildPrecedent = (fields: Fields, text: string) =>
	`---\n${Bun.YAML.stringify(fields, null, 2)}\n---\n\n${text}\n`;

// the file with only its departments field changed; the caller has read its header
export function withDepartments(text: string, departments: string[]): string {
	const split = splitPrecedent(text);
	const fields = parsed(text);
	if (split === null || fields === null)
		throw new Error("the precedent has no readable header");
	return `---\n${Bun.YAML.stringify({ ...fields, departments }, null, 2)}\n---\n${split.body}`;
}
