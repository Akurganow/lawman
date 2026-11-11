import { dirname, join } from "node:path";
import { cleanHostText } from "./clean-host";
import { WORKER_ENV } from "./clean-worker";

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

// a library error can quote the input, so each caller prints its own message
export class CleanFailed extends Error {}

export type Cleaned = { text: string; withheld: boolean };

const withheld: Cleaned = { text: WITHHELD, withheld: true };

async function inProcess(text: string): Promise<Cleaned> {
	try {
		return { text: await cleanHostText(text), withheld: false };
	} catch {
		return withheld;
	}
}

// The command of the child: this journal with the worker variable set.
function workerCommand(): string[] {
	const compiled = import.meta.path.startsWith("/$bunfs/");
	return compiled
		? [process.execPath]
		: [process.execPath, join(dirname(import.meta.path), "journal.ts")];
}

type Reply = { ok: string } | { err: true };

class Child {
	constructor(private readonly budget: number) {}
	private readonly proc = Bun.spawn(workerCommand(), {
		stdin: "pipe",
		stdout: "pipe",
		stderr: "ignore",
		env: { ...process.env, [WORKER_ENV]: "1" },
	});
	private readonly lines = this.proc.stdout.getReader();
	private buffer = "";
	killed = false;

	// the reply to one text, or null when the budget passed first
	async ask(text: string): Promise<Reply | null> {
		this.proc.stdin.write(`${JSON.stringify(text)}\n`);
		this.proc.stdin.flush();
		const timer = setTimeout(() => this.kill(), this.budget);
		try {
			for (;;) {
				const end = this.buffer.indexOf("\n");
				if (end >= 0) {
					const line = this.buffer.slice(0, end);
					this.buffer = this.buffer.slice(end + 1);
					return JSON.parse(line) as Reply;
				}
				const { done, value } = await this.lines.read();
				if (done) {
					if (this.killed) return null;
					throw new CleanFailed();
				}
				this.buffer += new TextDecoder().decode(value);
			}
		} finally {
			clearTimeout(timer);
		}
	}

	kill(): void {
		this.killed = true;
		this.proc.kill(9);
	}
}

// The texts that are not short, one at a time in a child that is ended at the budget.
async function inChild(
	texts: string[],
	budget: number,
): Promise<Map<string, Cleaned>> {
	const done = new Map<string, Cleaned>();
	let child: Child | null = null;
	try {
		for (const text of texts) {
			child ??= new Child(budget);
			const reply = await child.ask(text);
			if (reply === null) child = null;
			done.set(
				text,
				reply === null || "err" in reply
					? withheld
					: { text: reply.ok, withheld: false },
			);
		}
	} finally {
		child?.kill();
	}
	return done;
}

// A withheld text is the text's own fault only when the cleaning works on a good one.
async function cleaningWorks(): Promise<void> {
	const good = await inProcess("ok");
	if (good.withheld || good.text !== "ok") throw new CleanFailed();
}

// Each text is cleaned alone. A text that cannot be cleaned, or does not finish within the
// budget, is withheld whole, never kept raw or part cleaned. A cleaning that fails for a good
// text too is no text's fault and throws.
export async function cleanEach(
	texts: string[],
	budget = CLEAN_BUDGET_MS,
): Promise<Map<string, Cleaned>> {
	const unique = [...new Set(texts)];
	const done = new Map<string, Cleaned>();
	for (const text of unique.filter((t) => t.length <= SHORT_TEXT))
		done.set(text, await inProcess(text));
	const long = unique.filter((t) => t.length > SHORT_TEXT);
	for (const [text, result] of await inChild(long, budget))
		done.set(text, result);
	if ([...done.values()].some((r) => r.withheld)) await cleaningWorks();
	return done;
}

export async function cleanOne(text: string): Promise<Cleaned> {
	return (await cleanEach([text])).get(text) as Cleaned;
}
