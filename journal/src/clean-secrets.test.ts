import { describe, expect, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { maskSecrets } from "./clean";

const fill = (n: number, alphabet = "A1b2C3d4E5f6G7h8K9m0") =>
	alphabet.repeat(Math.ceil(n / alphabet.length)).slice(0, n);
const hex = (n: number) => fill(n, "0a1b2c3d4e5f6789");
const letters = (n: number) => fill(n, "aBcDeFgHkLmNpQrStUvW");
const join = (...parts: string[]) => parts.join("");
const label = (kind: string) => `REMOVED ${kind} SECRET`;

const onePassword = () => {
	const json = JSON.stringify({ k: fill(101) });
	return join("op", "s_", Buffer.from(json).toString("base64"));
};

const privateKey = () =>
	generateKeyPairSync("ec", {
		namedCurve: "P-256",
		privateKeyEncoding: { type: "pkcs8", format: "pem" },
		publicKeyEncoding: { type: "spki", format: "pem" },
	}).privateKey.trim();

const KINDS: [string, () => string][] = [
	["AWS", () => join("AK", "IA", fill(16, "Q2W3E4R5T6Y7U8I9"))],
	["PRIVATEKEY", privateKey],
	["NPM", () => join("np", "m_", fill(36))],
	["SLACK", () => join("xo", "xb-", "123456789012-", fill(24))],
	["SENDGRID", () => join("S", "G.", fill(22), ".", fill(43))],
	["SHOPIFY", () => join("shp", "at_", fill(32))],
	["STRIPE", () => join("sk", "_live_", fill(24))],
	["GITLAB", () => join("gl", "pat-", fill(20))],
	["GRAFANA", () => join("gl", "sa_", fill(32), "_", hex(8))],
	["OPENAI", () => join("s", "k-", fill(20), "T3Blbk", "FJ", fill(20))],
	["ANTHROPIC", () => join("sk-", "ant-api03-", fill(93), "AA")],
	["GROQ", () => join("gs", "k_", fill(52))],
	["HUGGINGFACE", () => join("h", "f_", letters(34))],
	["LINEAR", () => join("lin", "_api_", fill(40))],
	["NOTION", () => join("nt", "n_", "12345678901", fill(35))],
	["1PASSWORD", onePassword],
	["HASHICORP VAULT", () => join("hv", "s.", fill(95))],
	["VERCEL", () => join("vc", "p_", fill(24))],
	["DATABRICKS", () => join("da", "pi", hex(32))],
	["DOCKER", () => join("dckr", "_pat_", fill(27))],
	["FIGMA", () => join("fi", "gd_", fill(40))],
	["CLOUDFLARE", () => join("cf", "at_", fill(40), hex(8))],
	["TAILSCALE", () => join("tskey", "-auth-", fill(12), "-", fill(20))],
	["GITLAB", () => join("gl", "cbt-", "ab12_", fill(20))],
	["GITLAB", () => join("gl", "dt-", fill(20))],
	["GITLAB", () => join("gl", "ffct-", fill(20))],
	["GITLAB", () => join("gl", "ft-", fill(20))],
	["GITLAB", () => join("gl", "imt-", fill(25))],
	["GITLAB", () => join("gl", "agent-", fill(50))],
	["GITLAB", () => join("gl", "oas-", fill(64))],
	["GITLAB", () => join("gl", "ptt-", hex(40))],
	["GITLAB", () => join("GR", "1348941", fill(20))],
	["GITLAB", () => join("gl", "rt-", fill(20))],
	["GITLAB", () => join("gl", "rt-t1_", fill(30), ".", "ab", "c1d2e3f")],
	["GITLAB", () => join("gl", "soat-", fill(20))],
	["ATLASSIAN", () => join("ATA", "TT3", fill(186))],
];

describe("secrets", () => {
	test.each(KINDS.map(([kind, make], i) => [kind, i, make] as const))(
		"%s token, sample %d, is replaced with its label",
		async (kind, _, make) => {
			const secret = make();
			expect(await maskSecrets(`key ${secret} end`)).toBe(
				`key ${label(kind)} end`,
			);
			expect(await maskSecrets(`\`${secret}\``)).toBe(`\`${label(kind)}\``);
		},
	);

	test.each(["ghp", "gho", "ghu", "ghs", "ghr"])(
		"GitHub prefix %s_ is masked from 20 characters on",
		async (prefix) => {
			for (const n of [20, 36]) {
				const secret = join(prefix, "_", fill(n));
				expect(await maskSecrets(`a ${secret} b`)).toBe(
					`a ${label("GITHUB")} b`,
				);
			}
		},
	);

	test("GitHub prefix github_pat_ is masked in both lengths", async () => {
		for (const n of [22, 82]) {
			const secret = join("github", "_pat_", fill(n, "A1_b2C3d4"));
			expect(await maskSecrets(`a ${secret} b`)).toBe(`a ${label("GITHUB")} b`);
		}
	});

	test("a directive in the text never suppresses a finding", async () => {
		const secret = join("gh", "p_", fill(36));
		const text = [
			"<!-- secretlint-disable -->",
			`${secret} // secretlint-disable-line`,
			"# secretlint-disable-next-line",
			secret,
		].join("\n");
		expect(await maskSecrets(text)).toBe(
			[
				"<!-- secretlint-disable -->",
				`${label("GITHUB")} // secretlint-disable-line`,
				"# secretlint-disable-next-line",
				label("GITHUB"),
			].join("\n"),
		);
	});

	test("several secrets in one text each get a label", async () => {
		const github = join("gh", "p_", fill(36));
		const npm = join("np", "m_", fill(36));
		expect(await maskSecrets(`a ${github} b ${npm} c`)).toBe(
			`a ${label("GITHUB")} b ${label("NPM")} c`,
		);
	});

	test("adjacent tokens give what the rules find today", async () => {
		const github = join("gh", "p_", fill(36));
		const npm = join("np", "m_", fill(36));
		const feed = join("gl", "ft-", fill(20));
		expect(await maskSecrets(`${github}${npm}`)).toBe(label("GITHUB"));
		expect(await maskSecrets(`${feed}${npm}`)).toBe(
			`${label("GITLAB")}${label("NPM")}`,
		);
		expect(await maskSecrets(`${npm}${github}`)).toBe(
			`${npm}${label("GITHUB")}`,
		);
	});

	test("a library token glued to a letter stays unmasked: the word-boundary limit", async () => {
		const glued = join("x", "np", "m_", fill(36));
		expect(await maskSecrets(glued)).toBe(glued);
	});

	test("labels hold no Markdown syntax character", async () => {
		const text = KINDS.map(([, make]) => make()).join("\n");
		const labels = (await maskSecrets(text)).split("\n");
		for (const line of labels) expect(line).toMatch(/^[A-Z0-9 ]+$/);
	});

	test("rules that do not detect by a prefix or a key block stay off", async () => {
		const offs = [
			join("https://", "user1", ":", "s3cretPw9", "@example.com/x"),
			join("postgres://", "admin", ":", "s3cretPw9", "@db.example.com/x"),
			join("bitbucket", "_secret = ", fill(64)),
		];
		for (const text of offs) expect(await maskSecrets(text)).toBe(text);
	});

	test.each([
		[
			"an AWS secret access key",
			() => join("AWS_SECRET", "_ACCESS_KEY = ", fill(40)),
		],
		["an AWS account ID", () => join("aws_account", "_id: ", "1234-5678-9012")],
		[
			"a token in an x-oauth-basic URL",
			() => join("https://", fill(40), ":x-oauth", "-basic@github.com/o/r"),
		],
	])("a keyword followed by a value stays: %s", async (_, make) => {
		const text = make();
		expect(await maskSecrets(text)).toBe(text);
	});

	test("a leading byte order mark does not shift the mask", async () => {
		const secret = join("np", "m_", fill(36));
		expect(await maskSecrets(`\uFEFFa ${secret} b`)).toBe(
			`\uFEFFa ${label("NPM")} b`,
		);
	});

	test("text with no secret stays byte-exact", async () => {
		const text = "commit 0123456789abcdef0123456789abcdef01234567 \u200D ok\n";
		expect(await maskSecrets(text)).toBe(text);
		expect(await maskSecrets("")).toBe("");
	});
});

describe("secrets behind block quote prefixes", () => {
	const github = () => join("gh", "p_", fill(36));
	const quoted = (first: string, rest: string, eol = "\n") =>
		privateKey()
			.split("\n")
			.map((line, i) => (i === 0 ? first : rest) + line)
			.join(eol);

	test.each([
		["a nested quote", "> > "],
		["markers with no space", ">>"],
	])("a private key behind %s is masked", async (_, prefix) => {
		expect(await maskSecrets(`a\n${quoted(prefix, prefix)}\nb`)).toBe(
			`a\n${prefix}${label("PRIVATEKEY")}\nb`,
		);
	});

	test("a private key with CRLF line endings is masked", async () => {
		expect(await maskSecrets(`a\r\n${quoted("> ", "> ", "\r\n")}\r\nb`)).toBe(
			`a\r\n> ${label("PRIVATEKEY")}\r\nb`,
		);
	});

	test("a token in a quote and one after it map to their own places", async () => {
		expect(await maskSecrets(`> t ${github()} t\nplain ${github()} x`)).toBe(
			`> t ${label("GITHUB")} t\nplain ${label("GITHUB")} x`,
		);
	});

	test("two findings on different quoted lines are both masked", async () => {
		const npm = join("np", "m_", fill(36));
		expect(await maskSecrets(`> ${github()}\n>> b ${npm}`)).toBe(
			`> ${label("GITHUB")}\n>> b ${label("NPM")}`,
		);
	});
});
