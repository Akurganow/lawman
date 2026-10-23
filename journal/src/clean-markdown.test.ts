import { describe, expect, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import type { Image, Link, Nodes } from "mdast";
import { cleanHostText, cleanPass, parseMarkdown } from "./clean-markdown";

function nodes(text: string): Nodes[] {
	const found: Nodes[] = [];
	const walk = (node: Nodes) => {
		found.push(node);
		if ("children" in node) for (const child of node.children) walk(child);
	};
	walk(parseMarkdown(text));
	return found;
}
const ofType = <T extends Nodes>(text: string, type: T["type"]) =>
	nodes(text).filter((n): n is T => n.type === type);
const linkText = (link: Link) =>
	link.children.map((c) => ("value" in c ? c.value : "")).join("");

const MARKER =
	"<!-- lawman: role=court stage=ruling at=2026-10-14T09:30:00Z -->";
const HOME = ["/Us", "ers/someone/x.md"].join("");

describe("images become links", () => {
	test("a Markdown image takes its alt text and address, and drops its title", async () => {
		expect(
			await cleanHostText('See ![logo](https://a.example/l.png "t") here.'),
		).toBe("See [logo](<https://a.example/l.png>) here.");
	});

	test("a reference image takes the address of its definition", async () => {
		const def = "\n\n[r]: https://a.example/r.png";
		const link = "(<https://a.example/r.png>)";
		expect(await cleanHostText(`![full][r]${def}`)).toBe(`[full]${link}${def}`);
		expect(await cleanHostText(`![r][]${def}`)).toBe(`[r]${link}${def}`);
		expect(await cleanHostText(`![r]${def}`)).toBe(`[r]${link}${def}`);
	});

	test("a reference with no definition is no image and stays text", async () => {
		expect(await cleanHostText("![x][none]")).toBe("![x][none]");
	});

	test("an empty alt gives the address as the link text", async () => {
		const [link, ...rest] = ofType<Link>(
			await cleanHostText("![](https://a.example/e.png)"),
			"link",
		);
		expect(rest).toEqual([]);
		expect(link && linkText(link)).toBe("https://a.example/e.png");
		expect(link?.url).toBe("https://a.example/e.png");
	});

	test("an image inside a link becomes its alt text, or its address", async () => {
		expect(
			await cleanHostText(
				"[![alt](https://a.example/i.png)](https://b.example)",
			),
		).toBe("[alt](https://b.example)");
		const out = await cleanHostText("[![](i.png)](https://b.example)");
		const [link, ...rest] = ofType<Link>(out, "link");
		expect(rest).toEqual([]);
		expect(link && linkText(link)).toBe("i.png");
	});

	test.each([
		[
			"link-breaking characters",
			"![a\\]b\\[c\\*d \\<e \\_f\\_](<https://a.example/x y)\\<z>)",
		],
		["a character reference", "![a &amp; b](https://a.example/?a=1&amp;b=2)"],
		["a table cell", "| h |\n| - |\n| ![a\\|b](https://a.example/u\\|v) |"],
	])(
		"the built link parses as one link with the same text and target: %s",
		async (_, input) => {
			const [image] = ofType<Image>(input, "image");
			const out = await cleanHostText(input);
			const [link, ...rest] = ofType<Link>(out, "link");
			expect(rest).toEqual([]);
			expect(link && linkText(link)).toBe(image?.alt ?? "");
			expect(link?.url).toBe(image?.url ?? "");
		},
	);

	test("a control character in the address is percent-encoded", async () => {
		const out = await cleanHostText("![a](https://a.example/a&#10;b)");
		const [link, ...rest] = ofType<Link>(out, "link");
		expect(rest).toEqual([]);
		expect(link?.url).toBe("https://a.example/a%0Ab");
	});

	test("a secret in alt text is masked", async () => {
		const token = ["gh", "p_", "A1b2C3d4E5f6G7h8K9m0"].join("");
		const def = "\n\n[r]: https://a.example/r.png";
		expect(await cleanHostText(`![${token}](u)`)).toBe(
			"[REMOVED GITHUB SECRET](<u>)",
		);
		expect(await cleanHostText(`![${token}][r]${def}`)).toBe(
			`[REMOVED GITHUB SECRET](<https://a.example/r.png>)${def}`,
		);
		expect(await cleanHostText(`[![${token}](i)](h)`)).toBe(
			"[REMOVED GITHUB SECRET](h)",
		);
	});

	test("a reference image inside a link becomes its alt text", async () => {
		const def = "\n\n[r]: https://a.example/r.png";
		expect(await cleanHostText(`[![a][r]](h)${def}`)).toBe(`[a](h)${def}`);
	});

	test("a bang left before a built link stays text and builds no image", async () => {
		const input = "!!![a](u)";
		const once = await cleanPass(input);
		expect(once).toBe("!\\![a](<u>)");
		expect(await cleanPass(once)).toBe(once);
	});
});

describe("hidden comments", () => {
	test("an inline and a block comment are cut", async () => {
		expect(await cleanHostText("a <!-- hidden --> b")).toBe("a  b");
		expect(await cleanHostText("a\n\n<!-- hidden -->\n\nb")).toBe("a\n\n\n\nb");
	});

	test("every comment of a comment block is cut in one pass", async () => {
		expect(await cleanPass("<!-- a --> <!-- b --> c")).toBe("  c");
	});

	test("a comment in a block quote ends with its container", async () => {
		expect(await cleanHostText("> <!-- open\n> still\n\nvisible")).toBe(
			"> \n\nvisible",
		);
	});

	test("a comment in a list item ends with its container", async () => {
		expect(await cleanHostText("- <!-- open\n  still\n\nvisible")).toBe(
			"- \n\nvisible",
		);
		expect(await cleanHostText("- a\n  <!-- open\n  still\n\nvisible")).toBe(
			"- a\n  \n\nvisible",
		);
	});

	test("an unclosed comment at block level runs to the end", async () => {
		expect(await cleanHostText("a\n\n<!-- open\nhidden\n\nhidden too")).toBe(
			"a\n\n",
		);
	});

	test("a comment opener split by a comment stays visible text", async () => {
		const out = await cleanHostText("<!<!-- a -->-- b -->");
		expect(out).toBe("\\<!-- b -->");
		expect(ofType(out, "html")).toEqual([]);
	});

	test("a comment that joins a token leaves the token masked", async () => {
		const token = ["gh", "p_", "A1b2C3d4E5", "<!-- x -->", "f6G7h8K9m0"];
		expect(await cleanHostText(`t ${token.join("")} t`)).toBe(
			"t REMOVED GITHUB SECRET t",
		);
	});

	test("a comment that closes on its own opener dashes is cut alone", async () => {
		expect(await cleanPass("<!--> x")).toBe(" x");
		expect(await cleanPass("<!---> x")).toBe(" x");
		expect(await cleanPass("a <!--> b")).toBe("a  b");
	});

	test("a comment in a table cell is cut", async () => {
		expect(await cleanHostText("| h |\n| - |\n| a <!-- x --> b |")).toBe(
			"| h |\n| - |\n| a  b |",
		);
	});

	test("an escaped opener gets no second backslash, an unescaped one does", async () => {
		expect(await cleanHostText("\\<!<!-- a -->-- b -->")).toBe("\\<!-- b -->");
		expect(await cleanHostText("\\\\<!<!-- a -->-- b -->")).toBe(
			"\\\\\\<!-- b -->",
		);
	});

	test("details and other raw HTML stay", async () => {
		const details = "<details>\n<summary>s</summary>\n\nbody\n</details>";
		expect(await cleanHostText(details)).toBe(details);
	});

	test("a comment in a fenced block or a code span stays", async () => {
		const code = "```\n<!-- kept -->\n```\n\nand `<!-- kept -->`";
		expect(await cleanHostText(code)).toBe(code);
	});

	test("a valid marker line stays", async () => {
		expect(await cleanHostText(`body\n${MARKER}`)).toBe(`body\n${MARKER}`);
		expect(await cleanHostText(`<!-- open\n${MARKER}`)).toBe(`\n${MARKER}`);
		expect(await cleanHostText(`<!-- open\r\n${MARKER}\r\nrest`)).toBe(
			`\n${MARKER}\r\nrest`,
		);
		expect(await cleanHostText(`  <!-- open\n${MARKER}\nrest`)).toBe(
			`  \n${MARKER}\nrest`,
		);
	});

	test("paths and mentions stay", async () => {
		const text = `See ${HOME}, ~/y and @${"someone"}.`;
		expect(await cleanHostText(text)).toBe(text);
	});
});

describe("characters and secrets in containers", () => {
	const key = () =>
		generateKeyPairSync("ec", {
			namedCurve: "P-256",
			privateKeyEncoding: { type: "pkcs8", format: "pem" },
			publicKeyEncoding: { type: "spki", format: "pem" },
		}).privateKey.trim();
	const prefixed = (first: string, rest: string) =>
		key()
			.split("\n")
			.map((line, i) => (i === 0 ? first : rest) + line)
			.join("\n");

	test("a private key in a block quote is masked and the prefix stays", async () => {
		expect(await cleanHostText(`a\n\n${prefixed("> ", "> ")}\n\nb`)).toBe(
			"a\n\n> REMOVED PRIVATEKEY SECRET\n\nb",
		);
	});

	test("a private key in a list item inside a block quote is masked", async () => {
		expect(await cleanHostText(`${prefixed("> - ", ">   ")}\n> tail`)).toBe(
			"> - REMOVED PRIVATEKEY SECRET\n> tail",
		);
	});

	test("hidden characters are removed", async () => {
		expect(await cleanHostText("a\u{200B}b `c\u{2060}d`")).toBe("ab `cd`");
	});
});

describe("passes", () => {
	test("nested comment openers of 64 KiB end after two passes", async () => {
		const depth = Math.ceil((64 * 1024) / 5);
		const nested = `${"<!".repeat(depth)}<!---->${"-->".repeat(depth)}`;
		const once = await cleanPass(nested);
		expect(await cleanPass(once)).toBe(once);
		expect(await cleanHostText(nested)).toBe(once);
		expect(ofType(once, "html")).toEqual([]);
	});

	test("a link built by a cut across its brackets takes a third pass", async () => {
		const once = await cleanPass("![a]<!---->(u)");
		expect(once).toBe("![a](u)");
		const twice = await cleanPass(once);
		expect(twice).toBe("[a](<u>)");
		expect(await cleanPass(twice)).toBe(twice);
	});

	test("cleaning a cleaned output changes nothing", async () => {
		const input = [
			"![a](u) <!-- c --> [![](i)](h)",
			"> <!-- open",
			"",
			`text ${["gh", "o_", "A1b2C3d4E5f6G7h8K9m0"].join("")}`,
			MARKER,
		].join("\n");
		const out = await cleanHostText(input);
		expect(await cleanPass(out)).toBe(out);
	});

	test("the same input gives the same output", async () => {
		const input = "![a](u) <!<!-- x -->-- y -->";
		expect(await cleanHostText(input)).toBe(await cleanHostText(input));
	});
});
