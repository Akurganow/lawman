import { EXIT, Fail } from "./db";

const PATTERNS = {
	precinct: /^[a-z][a-z0-9-]*$/,
	role: /^[a-z][a-z0-9-]*$/,
	department: /^[a-z][a-z0-9-]*$/,
	repo: /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/,
	login: /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/,
	outcome:
		/^(silent|ordered|filed|capped|failed|investigated|charged|returned|declined|defended|refuted|convicted|acquitted|recorded|admitted|asked|handed|shut|settled|kept|specified|out|executed|skipped-[a-z0-9-]+|stopped-[a-z0-9-]+)$/,
};

export function check(kind: keyof typeof PATTERNS, value: string): string {
	if (!PATTERNS[kind].test(value)) {
		throw new Fail(EXIT.USAGE, `invalid ${kind}: ${JSON.stringify(value)}`);
	}
	return value;
}

export function usage(text: string): Fail {
	return new Fail(EXIT.USAGE, `usage: journal ${text}`);
}

// --exclude repeats, which parseArgs does not allow
export function splitExcluded(
	args: string[],
	text: string,
): { excluded: string[]; rest: string[] } {
	const excluded: string[] = [];
	const rest: string[] = [];
	for (let i = 0; i < args.length; i += 2) {
		const [flag, value] = [args[i], args[i + 1]];
		if (flag !== "--exclude") rest.push(...args.slice(i, i + 2));
		else if (value === undefined) throw usage(text);
		else excluded.push(check("precinct", value));
	}
	return { excluded, rest };
}

type Parsed<P extends 0 | 1, N extends string, O extends string> = {
	pos: P extends 1 ? [string] : [];
	opt: Record<N, string> & Partial<Record<O, string>>;
};

export function parseArgs<
	P extends 0 | 1,
	N extends string,
	O extends string = never,
>(
	args: string[],
	positional: P,
	names: N[],
	text: string,
	optional: O[] = [],
): Parsed<P, N, O> {
	const pos = args.slice(0, positional);
	const rest = args.slice(positional);
	const opt: Record<string, string> = {};
	const allowed: string[] = [...names, ...optional];
	if (
		pos.length < positional ||
		rest.length % 2 !== 0 ||
		rest.length > allowed.length * 2
	)
		throw usage(text);
	for (let i = 0; i < rest.length; i += 2) {
		const flag = rest[i];
		const value = rest[i + 1];
		if (flag === undefined || value === undefined) throw usage(text);
		const name = flag.slice(2);
		if (!flag.startsWith("--") || !allowed.includes(name) || name in opt)
			throw usage(text);
		opt[name] = value;
	}
	if (names.some((name) => !(name in opt))) throw usage(text);
	return { pos, opt } as Parsed<P, N, O>;
}

export function pick<T>(
	table: Record<string, T>,
	key: string | undefined,
): T | undefined {
	return key !== undefined && Object.hasOwn(table, key)
		? table[key]
		: undefined;
}

export function subcommand<T>(
	table: Record<string, T>,
	args: string[],
	text: string,
): { run: T; rest: string[] } {
	const [name, ...rest] = args;
	const run = pick(table, name);
	if (run === undefined) throw usage(text);
	return { run, rest };
}

export function count(value: string, label: string, min: number): number {
	const n = Number(value);
	if (!/^\d+$/.test(value) || !Number.isSafeInteger(n) || n < min) {
		throw new Fail(EXIT.USAGE, `invalid ${label}: ${JSON.stringify(value)}`);
	}
	return n;
}
