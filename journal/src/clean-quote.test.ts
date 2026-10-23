import { describe, expect, test } from "bun:test";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { cleanQuotes } from "./clean-quote";

const TOKEN = ["gh", "p_", "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8"].join("");
const LABEL = "REMOVED GITHUB SECRET";
const ZWSP = "\u200B";
const HIDDEN_CLOSER = `\`\`${ZWSP}\``;

const codeValues = (text: string) => {
	const values: string[] = [];
	const tree = unified().use(remarkParse).use(remarkGfm).parse(text);
	visit(tree, "code", (node) => {
		values.push(node.value);
	});
	return values;
};

describe("a quote is cleaned and never rejected", () => {
	test("a fenced block loses hidden characters and secrets", async () => {
		expect(await cleanQuotes(`\`\`\`\nkey ${TOKEN} a${ZWSP}b\n\`\`\`\n`)).toBe(
			`\`\`\`\nkey ${LABEL} ab\n\`\`\`\n`,
		);
	});

	test("a fenced block with CR line endings is cleaned", async () => {
		const out = await cleanQuotes(
			`a\r\`\`\`\rkey ${TOKEN} a${ZWSP}b\r\`\`\`\r`,
		);
		expect(out).toBe(`a\r\`\`\`\rkey ${LABEL} ab\r\`\`\`\r`);
	});

	test("image syntax and comment text pass inside and outside a quote", async () => {
		const text = [
			"![own](https://a.example/o.png) <!-- own -->",
			"",
			"```rust",
			"![quoted](https://a.example/q.png)",
			"<!-- quoted -->",
			"```",
			"",
		].join("\n");
		expect(await cleanQuotes(text)).toBe(text);
	});

	test("text outside code keeps its hidden characters and secrets", async () => {
		const text = `own ${TOKEN}${ZWSP}\n\n\`\`\`\na${ZWSP}\n\`\`\`\n`;
		expect(await cleanQuotes(text)).toBe(
			`own ${TOKEN}${ZWSP}\n\n\`\`\`\na\n\`\`\`\n`,
		);
	});

	test("a cleaner failure reaches the caller", async () => {
		const fail = () => Promise.reject(new Error("cleaner failed"));
		expect(cleanQuotes("```\na\n```\n", fail)).rejects.toThrow(
			"cleaner failed",
		);
	});
});

describe("a changed block gets a new fence", () => {
	test("two backticks, a hidden character and a backtick do not become a closer", async () => {
		const out = await cleanQuotes(`\`\`\`\n${HIDDEN_CLOSER}\n\`\`\`\nafter\n`);
		expect(out).toBe("````\n```\n````\nafter\n");
		expect(codeValues(out)).toEqual(["```"]);
	});

	test("the fence is never shorter than before", async () => {
		expect(await cleanQuotes(`\`\`\`\`\`\na${ZWSP}\n\`\`\`\`\`\n`)).toBe(
			"`````\na\n`````\n",
		);
	});

	test("a tilde fence works the same", async () => {
		const out = await cleanQuotes(`~~~\n~~${ZWSP}~\n~~~\n`);
		expect(out).toBe("~~~~\n~~~\n~~~~\n");
		expect(codeValues(out)).toEqual(["~~~"]);
	});

	test("the info string stays", async () => {
		expect(
			await cleanQuotes(`\`\`\` js  title="a"\n${HIDDEN_CLOSER}\n\`\`\`\n`),
		).toBe('```` js  title="a"\n```\n````\n');
	});

	test("lines in a block quote keep their prefix", async () => {
		const out = await cleanQuotes(`> \`\`\`\n> ${HIDDEN_CLOSER}\n> \`\`\`\n`);
		expect(out).toBe("> ````\n> ```\n> ````\n");
		expect(codeValues(out)).toEqual(["```"]);
	});

	test("lines in a list item keep their prefix", async () => {
		const out = await cleanQuotes(
			`- item\n\n  \`\`\`\n  ${HIDDEN_CLOSER}\n  \`\`\`\n- next\n`,
		);
		expect(out).toBe("- item\n\n  ````\n  ```\n  ````\n- next\n");
		expect(codeValues(out)).toEqual(["```"]);
	});

	test("a secret in a block quote is masked in place", async () => {
		expect(await cleanQuotes(`> \`\`\`\n> ${TOKEN}\n> \`\`\`\n`)).toBe(
			`> \`\`\`\n> ${LABEL}\n> \`\`\`\n`,
		);
	});

	test("an unclosed fence stays unclosed", async () => {
		const out = await cleanQuotes(`\`\`\`\n${HIDDEN_CLOSER}\ntail\n`);
		expect(out).toBe("````\n```\ntail\n");
		expect(codeValues(out)).toEqual(["```\ntail"]);
	});

	test("an indented block changes in place", async () => {
		expect(
			await cleanQuotes(`text\n\n    a${ZWSP}b\n    ${HIDDEN_CLOSER}\n`),
		).toBe("text\n\n    ab\n    ```\n");
	});
});

describe("bytes outside a changed block stay exact", () => {
	test("an untouched block stays byte-exact", async () => {
		const text = "  ````  js  \nfoo\t\n  ````   \n\n    bar  \n";
		expect(await cleanQuotes(text)).toBe(text);
	});

	test("an untouched block beside a changed one stays exact", async () => {
		const kept = "~~~~ sh\nkept\n~~~~~";
		const out = await cleanQuotes(
			`${kept}\n\n *own*  text\n\n\`\`\`\na${ZWSP}\n\`\`\`\n\n${kept}\n`,
		);
		expect(out).toBe(
			`${kept}\n\n *own*  text\n\n\`\`\`\na\n\`\`\`\n\n${kept}\n`,
		);
	});
});
