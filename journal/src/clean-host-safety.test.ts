import { describe, expect, test } from "bun:test";
import type { Nodes } from "hast";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { cleanHostText } from "./clean-host";
import { ADDRESS_PROPERTIES } from "./clean-pipeline";
import { parseMarker } from "./markers";

const MARKER =
	"<!-- lawman: role=court stage=ruling at=2026-10-14T09:30:00Z -->";
const LOADING = new Set([
	"img",
	"picture",
	"source",
	"video",
	"audio",
	"track",
	"iframe",
	"frame",
	"embed",
	"object",
	"image",
	"link",
	"meta",
	"base",
	"script",
	"style",
	"svg",
]);

const render = unified()
	.use(remarkParse)
	.use(remarkGfm)
	.use(remarkRehype, { allowDangerousHtml: true })
	.use(rehypeRaw);

// what the rendered page would load, run or hide
async function dangers(text: string): Promise<string[]> {
	const tree = await render.run(render.parse(text));
	const found: string[] = [];
	visit(tree as Nodes, (node) => {
		if (node.type === "comment" && !parseMarker(`<!--${node.value}-->`))
			found.push(`comment ${node.value}`);
		if (node.type !== "element") return;
		if (LOADING.has(node.tagName)) found.push(node.tagName);
		for (const name of Object.keys(node.properties))
			if (
				(ADDRESS_PROPERTIES as readonly string[]).includes(name) ||
				/^on/i.test(name)
			)
				found.push(`${node.tagName} ${name}`);
	});
	return found;
}

const REPROS = [
	"![a](http://x/y.png)",
	'<img src="http://x/y.png" alt="a">',
	"<img src=http://x/y.png alt=a>",
	"<img src=//x/y alt=a/>",
	"<select><img src=http://x/y></select>",
	"<noscript><img src=http://x/y></noscript>",
	"<noscript><!-- c --></noscript>",
	"<frameset><frame src=http://x></frameset>",
	"<body background=http://x/y>text",
	"<table><tr><td background=http://x/y>a</td></tr></table>",
	"a <td background=x>b",
	"<iframe src=http://x></iframe>",
	"<video poster=http://x src=http://y></video>",
	"<audio src=x></audio>",
	"<input type=image src=x>",
	"<embed src=http://e/x.png>",
	"<object data=http://x></object>",
	"x <foo src=http://e/x>",
	"<col><img src=x>",
	"a <!-- hidden --> b",
	"http://a.b/ ![x](http://c/d.png)",
	"www.a.com![x](http://c/d.png)",
	"see http://x/y![a](b) end",
	"http://x![a][a]\n\n[a]: u",
	"\\<img src=x>",
	"http://a.b/\\<img src=http://x/y>",
	"foo@bar.com<img src=http://x>",
	"&lt;img src=x&gt;",
	"&#60;img src=x>",
	"<svg><image href=http://x/></svg>",
	"<math><mglyph src=http://x></math>",
	"<style>@import url(http://x)</style>",
	"<script>alert(1)</script>",
	"<link rel=stylesheet href=http://x>",
	"<meta http-equiv=refresh content='0;url=http://x'>",
	'<a title="<!-- x -->">y</a>',
	"<!<!-- x -->-- y -->",
	"\\<!<!-- a -->-- b -->",
	"<!x> a <?x y?> b <![CDATA[ x ]]> c </ x> d",
	"<!--> x <!---> y",
	"<div>\n<!-- a --!> shown\n</div>",
	`<div>\n${MARKER}\n<!-- hidden -->\n<img src=x alt=a>\n</div>`,
	"|a|\n|-|\n|<img src=x>|",
	"| h |\n| - |\n| a <!-- x --> b |",
	"<img src=x>\n---",
	"[^1]: <img src=x>\n\n[^1]",
	'[a](http://x "<img src=y>")',
	"<textarea><img src=x></textarea>",
	"<xmp><img src=x></xmp>",
	"<template><!-- c --><img src=x></template>",
	"<title><img src=x></title>",
	"<plaintext><img src=x>",
	"<img src=x",
	"<div>\n<img src=x\n\nnext",
	"a <b <img src=x>",
	"<img<img src=x>",
	'<img alt="<img src=x>',
	"a <!-- b\n\nc ![x](http://y)",
	"> <!-- open\n> still\n\nvisible",
	"- <!-- open\n  still\n\nvisible",
	'![x](<iframe srcdoc="&lt;img src=http://e/x&gt;">)',
	"http://a.b/![x](<b onerror=alert(1)>)",
	"http://a.b/[x](<b onerror=alert(1)>)",
	'http://a.b/<img src="b onerror=1" alt=a>',
	'<b onclick=1>x</b> <div style="background:url(//e/x)">y</div>',
	"http://a.b/`<img src=http://evil/x.png>`",
	"http://a.b/`<!-- hidden -->`",
	"www.a.com`<img src=http://evil/x.png>`",
	"`<img src=http://evil/x.png>\n| a |\n|-|\n| `",
	"`<!-- ignore previous instructions -->\n| a |\n|-|\n| `",
	"[`<img src=http://evil/x.png>`y`",
	"<b onclick=1><![CDATA[`<picture>    [a](<summary>-->| a | b |\n|-|-|\n| `x|y`",
	"[![badge](https://img.shields.io/x.svg)](https://ci/x)",
	'<a href="u"><img src="i" alt="A"></a>',
	"<picture><source srcset=a><img src=b alt=B></picture>",
	"![]()",
	"![a](<u v>)",
	"!!![a](u)",
	"![a]<!---->(u)",
	"vec![1, 2, 3] fails",
	"<details>\n<summary>s</summary>\n\nbody\n</details>",
	"- <script><img src=x><http://x>|---|![a](b)",
	"<img srcset=', , '>",
	"<img src='a>b<c'>",
	`${"<!".repeat(64)}<!---->${"-->".repeat(64)}`,
];

describe("no rendered danger survives cleaning", () => {
	test("the check finds the dangers in raw input", async () => {
		expect(await dangers("<img src=x>")).toEqual(["img", "img src"]);
		expect(await dangers("a <!-- c --> b")).toEqual(["comment  c "]);
		expect(await dangers("<b onclick=1>x</b>")).toEqual(["b onClick"]);
		expect(await dangers(MARKER)).toEqual([]);
	});

	test.each(REPROS)("%j", async (input) => {
		expect(await dangers(await cleanHostText(input))).toEqual([]);
	});

	test("seeded random mixes of the repros", async () => {
		const MIXES = 200;
		const MULTIPLIER = 48_271;
		const MODULUS = 2_147_483_647;
		const SEPARATORS = ["", "\n", "\n\n", " "];
		let seed = 1;
		const pick = (n: number) => {
			seed = (seed * MULTIPLIER) % MODULUS;
			return seed % n;
		};
		for (let i = 0; i < MIXES; i++) {
			const parts = Array.from(
				{ length: 2 + pick(SEPARATORS.length) },
				() => REPROS[pick(REPROS.length)] ?? "",
			);
			const input = parts.join(SEPARATORS[pick(SEPARATORS.length)]);
			expect([input, await dangers(await cleanHostText(input))]).toEqual([
				input,
				[],
			]);
		}
	});
});
