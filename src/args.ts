import { EXIT, Fail } from "./db";

const PATTERNS = {
  precinct: /^[a-z][a-z0-9-]*$/,
  role: /^[a-z][a-z0-9-]*$/,
  department: /^[a-z][a-z0-9-]*$/,
  repo: /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/,
  login: /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/,
  outcome: /^(silent|ordered|filed|capped|failed|skipped-[a-z0-9-]+|stopped-[a-z0-9-]+)$/,
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

export function parseArgs(args: string[], positional: number, names: string[], text: string, optional: string[] = []) {
  const pos = args.slice(0, positional);
  const rest = args.slice(positional);
  const opt: Record<string, string> = {};
  const allowed = [...names, ...optional];
  if (pos.length < positional || rest.length % 2 !== 0 || rest.length > allowed.length * 2) throw usage(text);
  for (let i = 0; i < rest.length; i += 2) {
    const name = rest[i].slice(2);
    if (!rest[i].startsWith("--") || !allowed.includes(name) || name in opt) throw usage(text);
    opt[name] = rest[i + 1];
  }
  if (names.some((name) => !(name in opt))) throw usage(text);
  return { pos, opt };
}

export function count(value: string, label: string, min: number): number {
  const n = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(n) || n < min) {
    throw new Fail(EXIT.USAGE, `invalid ${label}: ${JSON.stringify(value)}`);
  }
  return n;
}
