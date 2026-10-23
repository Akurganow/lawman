import { lintSource } from "@secretlint/core";
import { rules as recommended } from "@secretlint/secretlint-rule-preset-recommend";

// The character list and the selector rule follow FilterInvisibleCharacters in
// github-mcp-server pkg/sanitize/sanitize.go at 25f11e6, MIT, Copyright (c) 2025 GitHub.
const INVISIBLE =
	/[\u{E0001}\u{E0020}-\u{E007F}\u200B\u200C\u200E\u200F\u061C\u202A-\u202E\u2066-\u2069\u00AD\u180E\u2060-\u2064\uFEFF]/u;
const SELECTOR = /[\uFE00-\uFE0F\u{E0100}-\u{E01EF}]/u;
const SUPPLEMENT_START = 0xe0100;
// Go's IsGraphic minus IsSpace: every space separator is white space
const GRAPHIC_BASE = /[\p{L}\p{M}\p{N}\p{P}\p{S}]/u;
const HAN = /\p{Script=Han}/u;
const ASCII_END = 0x80;
const KEYCAP_BASE = /[#*0-9]/;
const PRESENTATION = /[\uFE0E\uFE0F]/;

function selectorFits(base: string, selector: string): boolean {
	if (SELECTOR.test(base) || !GRAPHIC_BASE.test(base)) return false;
	if ((selector.codePointAt(0) ?? 0) >= SUPPLEMENT_START) return HAN.test(base);
	if ((base.codePointAt(0) ?? 0) < ASCII_END)
		return KEYCAP_BASE.test(base) && PRESENTATION.test(selector);
	return true;
}

export function stripInvisible(text: string): string {
	let out = "";
	let prev = "";
	let prevKept = false;
	for (const ch of text) {
		const keep: boolean = SELECTOR.test(ch)
			? prevKept && selectorFits(prev, ch)
			: !INVISIBLE.test(ch);
		if (keep) out += ch;
		prev = ch;
		prevKept = keep;
	}
	return out;
}

// gcp detects by file type; basicauth, database-connection-string and
// filter-comments stay off, so a directive in the text suppresses nothing
const SECRETLINT_KINDS = [
	"aws",
	"privatekey",
	"npm",
	"slack",
	"sendgrid",
	"shopify",
	"stripe",
	"github",
	"gitlab",
	"grafana",
	"openai",
	"anthropic",
	"groq",
	"huggingface",
	"linear",
	"notion",
	"1password",
	"hashicorp-vault",
	"vercel",
	"databricks",
	"docker",
	"figma",
	"cloudflare",
	"tailscale",
];
const RULE_PREFIX = "@secretlint/secretlint-rule-";
// findings led by a keyword fail the fixed-prefix test, so they stay off
const RULE_SETTINGS: Record<
	string,
	{ options?: { enableIDScanRule: boolean }; allowMessageIds: string[] }
> = {
	aws: {
		options: { enableIDScanRule: true },
		allowMessageIds: ["AWSSecretAccessKey", "AWSAccountID"],
	},
	npm: { allowMessageIds: ["PackageJSON_xOauthToken"] },
};
const SECRETLINT_RULES = recommended
	.map((rule) => ({ rule, kind: rule.meta.id.slice(RULE_PREFIX.length) }))
	.filter(({ kind }) => SECRETLINT_KINDS.includes(kind))
	.map(({ rule, kind }) => ({
		id: rule.meta.id,
		rule,
		...RULE_SETTINGS[kind],
	}));

// The GitLab and Atlassian shapes are derived from gitleaks config/gitleaks.toml
// at 09242ce, MIT, Copyright (c) 2019 Zachary Rice.
// the routable runner shape comes first, because alternation takes the first match
const GITLAB_SHAPES = [
	/glcbt-[0-9a-zA-Z]{1,5}_[0-9a-zA-Z_-]{20}/,
	/gldt-[0-9a-zA-Z_-]{20}/,
	/glffct-[0-9a-zA-Z_-]{20}/,
	/glft-[0-9a-zA-Z_-]{20}/,
	/glimt-[0-9a-zA-Z_-]{25}/,
	/glagent-[0-9a-zA-Z_-]{50}/,
	/gloas-[0-9a-zA-Z_-]{64}/,
	/glptt-[0-9a-f]{40}/,
	/GR1348941[\w-]{20}/,
	/\bglrt-t\d_[0-9a-zA-Z_-]{27,300}\.[0-9a-z]{2}[0-9a-z]{7}\b/,
	/glrt-[0-9a-zA-Z_-]{20}/,
	/glsoat-[0-9a-zA-Z_-]{20}/,
];
const LOCAL_RULES: [string, RegExp][] = [
	["github", /gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}/g],
	["gitlab", new RegExp(GITLAB_SHAPES.map((re) => re.source).join("|"), "g")],
	["atlassian", /\bATATT3[A-Za-z0-9_\-=]{186}(?=[`'"\s;]|\\[nr]|$)/g],
];

type Found = { start: number; end: number; kind: string };

async function secretlintFindings(text: string): Promise<Found[]> {
	const result = await lintSource({
		source: { content: text, filePath: "", ext: ".txt", contentType: "text" },
		options: { config: { rules: SECRETLINT_RULES }, noPhysicFilePath: true },
	});
	// secretlint drops a leading byte order mark before it counts offsets
	const shift = text.startsWith("\uFEFF") ? 1 : 0;
	return result.messages.map(({ range: [start, end], ruleId }) => ({
		start: start + shift,
		end: end + shift,
		kind: ruleId.slice(RULE_PREFIX.length),
	}));
}

function localFindings(text: string): Found[] {
	return LOCAL_RULES.flatMap(([kind, re]) =>
		[...text.matchAll(re)].map((m) => ({
			start: m.index,
			end: m.index + m[0].length,
			kind,
		})),
	);
}

function merged(found: Found[]): Found[] {
	const out: Found[] = [];
	for (const f of found.toSorted((a, b) => a.start - b.start)) {
		const last = out.at(-1);
		if (last && f.start < last.end) last.end = Math.max(last.end, f.end);
		else out.push({ ...f });
	}
	return out;
}

const label = (kind: string) =>
	`REMOVED ${kind.replaceAll("-", " ").toUpperCase()} SECRET`;

// a block quote prefix inside a key block hides the key, so detection reads
// the text without those prefixes and maps each finding back
const QUOTE_PREFIX = /^(?:[ \t]*>)+/;

function withoutQuotePrefixes(text: string) {
	const shifts: [number, number][] = [];
	let view = "";
	let raw = 0;
	for (const line of text.split("\n")) {
		const prefix = line.match(QUOTE_PREFIX)?.[0].length ?? 0;
		shifts.push([view.length, raw + prefix - view.length]);
		view += `${line.slice(prefix)}\n`;
		raw += line.length + 1;
	}
	const toRaw = (at: number) =>
		at + (shifts.findLast(([from]) => from <= at)?.[1] ?? 0);
	return { view: view.slice(0, -1), toRaw };
}

// expects text that stripInvisible cleaned, because a hidden character can split a token
export async function maskSecrets(text: string): Promise<string> {
	const { view, toRaw } = withoutQuotePrefixes(text);
	// an end maps from its last character, so the next line's prefix stays out of the range
	const found = merged([
		...(await secretlintFindings(view)),
		...localFindings(view),
	]).map((f) => ({ ...f, start: toRaw(f.start), end: toRaw(f.end - 1) + 1 }));
	let out = text;
	for (const { start, end, kind } of found.reverse())
		out = out.slice(0, start) + label(kind) + out.slice(end);
	return out;
}
