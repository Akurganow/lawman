import { cleanHostText } from "./clean-host";

// The most time one text may take to clean. The slowest ordinary text measured at the
// largest size a host accepts (65 536 characters of a table) took 357 ms, so the
// budget is about fourteen times that. A text that does not finish is withheld.
export const CLEAN_BUDGET_MS = 5000;

// A text this short cannot run long: the slowest shape found takes about 30 ms at
// this size, and its cost grows eightfold per doubling. Shorter texts run in this
// process. Longer ones run in a process that can be ended at the budget.
const SHORT_TEXT = 300;

// what a role reads in place of a text that was withheld
export const WITHHELD = "This text could not be cleaned and is withheld.";

export type Cleaned = { text: string; withheld: boolean };

const withheld: Cleaned = { text: WITHHELD, withheld: true };

async function inProcess(text: string): Promise<Cleaned> {
	try {
		return { text: await cleanHostText(text), withheld: false };
	} catch {
		return withheld;
	}
}

// The texts that are not short, one at a time in a worker that is ended at the budget.
async function inWorker(
	texts: string[],
	budget: number,
): Promise<Map<string, Cleaned>> {
	const done = new Map<string, Cleaned>();
	let worker: Worker | null = null;
	try {
		for (const text of texts) {
			worker ??= new Worker(new URL("./clean-worker.ts", import.meta.url));
			const w = worker;
			const reply = await new Promise<string | null>((resolve) => {
				const timer = setTimeout(() => {
					worker = null;
					w.terminate();
					resolve(null);
				}, budget);
				w.onerror = () => {
					clearTimeout(timer);
					worker = null;
					resolve(null);
				};
				w.onmessage = (e) => {
					clearTimeout(timer);
					resolve(e.data);
				};
				w.postMessage(text);
			});
			done.set(
				text,
				reply === null ? withheld : { text: reply, withheld: false },
			);
		}
	} finally {
		worker?.terminate();
	}
	return done;
}

// Each text is cleaned alone. A text that cannot be cleaned, or does not finish within the
// budget, is withheld whole, never kept raw or part cleaned.
export async function cleanEach(
	texts: string[],
	budget = CLEAN_BUDGET_MS,
): Promise<Map<string, Cleaned>> {
	const unique = [...new Set(texts)];
	const done = new Map<string, Cleaned>();
	for (const text of unique.filter((t) => t.length <= SHORT_TEXT))
		done.set(text, await inProcess(text));
	const long = unique.filter((t) => t.length > SHORT_TEXT);
	for (const [text, result] of await inWorker(long, budget))
		done.set(text, result);
	return done;
}
