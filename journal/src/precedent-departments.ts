import { cleanCharacters } from "./clean";
import { finite, MODEL, modelOf, noul, shown } from "./jev";
import { sectionWords } from "./law-sections";

// The threshold and the question come from labelled cases: the tuning cases
// chose them, and the held-out cases check them once.
export const DEPARTMENTS_THRESHOLD = 0.7;
// the labelled cases the question and the threshold were checked on
export const DEPARTMENTS_CHECKED = { tuning: 56, heldOut: 24 };

// A department the precedent may serve, with the Mission of its page.
export type Candidate = { name: string; mission: string };

export const ALL = "all";
// the court's names of a new line: listed, the word all, or none written
export type Named = string[] | typeof ALL | null;

// The case list of a case department: the department, or all for `-`.
export const caseList = (department: string) =>
	department === "-" ? [] : [department];

// The list a file is written with: empty for the word all; else the court's names
// that are candidates, in candidate order, empty when they cover every candidate;
// else the case list, as is. caseOf is asked only in that last case.
export function originalList(
	named: Named,
	candidateNames: string[],
	caseOf: () => string[],
): string[] {
	if (named === ALL) return [];
	const known = candidateNames.filter((d) => named?.includes(d));
	if (known.length === 0) return caseOf();
	return known.length === candidateNames.length ? [] : known;
}

// Jev has something to add only to a named list that leaves a candidate out.
export const asksJev = (original: string[], candidateNames: string[]) =>
	original.length > 0 && candidateNames.some((d) => !original.includes(d));

// The court's names that are no candidate, each once. A name outside the class
// is null, so the output never repeats foreign text.
export const droppedNames = (
	named: Named,
	candidateNames: string[],
	inClass: (name: string) => boolean,
): (string | null)[] =>
	named === null || named === ALL
		? []
		: [...new Set(named)]
				.filter((n) => !candidateNames.includes(n))
				.map((n) => (inClass(n) ? n : null));

// The list to write, or null when nothing is added. A department outside the
// original list is added when its probability, read with two decimals as the
// evidence prints it, reaches the threshold; nothing leaves the original list. A
// list that covers every candidate is written empty, which also serves
// departments added later. A case department outside the candidates stays first.
export function decide(
	original: string[],
	candidateNames: string[],
	scored: [department: string, probability: number][],
	threshold: number,
): string[] | null {
	const added = scored
		.filter(([d, p]) => !original.includes(d) && Number(shown(p)) >= threshold)
		.map(([d]) => d);
	if (added.length === 0) return null;
	const kept = new Set([...original, ...added]);
	if (candidateNames.every((d) => kept.has(d))) return [];
	return [
		...original.filter((d) => !candidateNames.includes(d)),
		...candidateNames.filter((d) => kept.has(d)),
	];
}

const questionId = (name: string) => name.replaceAll("-", "_");

const departmentQuestion = (mission: string) =>
	noul(
		`Is the defect that the rule in \`state.precedent.rule\` condemns or excuses of the class of defect that this duty names? \`state.ruling\` holds the court's words that made the rule, and \`state.precedent.kind\` says whether the rule condemns a shape or protects it. The duty: ${mission}`,
		"The rule condemns or excuses a defect of the class the duty names.",
		"The defect the rule condemns or excuses is of another class; the rule at most touches the text or code that the duty also reads.",
	);

export type DepartmentsState = {
	rule: string;
	precedentKind: string;
	verdict: string | null;
	grounds: string | null;
	asked: Candidate[];
};

// The state of the request from raw texts: each passes the character layer
// before its sections are read.
export async function departmentsState(s: {
	rule: string;
	ruling: string;
	precedentKind: string;
	asked: Candidate[];
}): Promise<DepartmentsState> {
	const clean = await cleanCharacters(s.ruling);
	return {
		rule: await cleanCharacters(s.rule),
		precedentKind: s.precedentKind,
		verdict: sectionWords(clean, "Verdict"),
		grounds: sectionWords(clean, "Grounds"),
		asked: s.asked,
	};
}

// The request body, final newline included: one question per asked candidate,
// whose Mission stands in its own question alone.
export function departmentsBody(s: DepartmentsState): string {
	const ruling = {
		...(s.verdict === null ? {} : { verdict: s.verdict }),
		...(s.grounds === null ? {} : { grounds: s.grounds }),
	};
	return `${JSON.stringify({
		model: MODEL,
		state: { precedent: { rule: s.rule, kind: s.precedentKind }, ruling },
		questions: Object.fromEntries(
			s.asked.map((c) => [questionId(c.name), departmentQuestion(c.mission)]),
		),
	})}\n`;
}

// The model and one probability per asked department; it throws on any bad answer.
export function departmentsAnswer(
	body: string,
	names: string[],
): { model: string; scored: [string, number][] } {
	const root = JSON.parse(body);
	return {
		model: modelOf(root),
		scored: names.map((n): [string, number] => [
			n,
			finite(root, ["answers", questionId(n), "noul"]),
		]),
	};
}
