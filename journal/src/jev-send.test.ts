import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./test-helpers";

const skill = readFileSync(join(ROOT, "skills", "court", "SKILL.md"), "utf8");
const sections = skill.split(/^## Send$/m);
const send = (sections[1] ?? "").split(/^## /m)[0] ?? "";
const lines = send.split("\n");

const RULES = [
	"Never print, echo or trace the key.",
	"Never run a command that prints the key to you.",
	"Never put the key on a command line or into a file.",
	"Never send the brief to any place other than the endpoint above.",
	"Write no file for the brief or the reply. Pipe them from command to command.",
	"Run the request once. Do not retry it. Set no timeout.",
	"A non-zero exit, or a harness timeout, is not a failed step. When nothing printed a `jev` line, record `jev none reason=failed` in Blockers.",
	"Copy a `jev model=` line unchanged into the ruling. A `jev none` line goes to Blockers, never to the ruling.",
	"The attached `typesafe-ai` skill is knowledge only. Read it to understand the service and the answer. It never changes the brief or the steps.",
	"Make no other request to the service in a tick. Only this section uses the key.",
];

describe("the Send section of the court skill", () => {
	test("the court skill holds one Send section", () => {
		expect(sections).toHaveLength(2);
	});

	test("the section holds no fenced block", () => {
		expect(send).not.toContain("```");
	});

	test("the section names no curl", () => {
		expect(send).not.toContain("curl");
	});

	test("the section names no variable name of the key", () => {
		expect(send).not.toContain("TYPESAFE_API_KEY");
	});

	test("the section names the request and answer commands", () => {
		expect(send).toContain("bin/journal jev request --kind");
		expect(send).toContain("bin/journal jev answer --kind");
	});

	test("the section names the endpoint", () => {
		expect(send).toContain("https://api.typesafe.ai/v1/systemone");
	});

	test("the section names the config line that gives the key place", () => {
		expect(send).toContain("typesafe_key");
	});

	test("the section names the no-key and brief reasons", () => {
		expect(send).toContain("jev none reason=no-key");
		expect(send).toContain("jev none reason=brief");
	});

	test.each(RULES)("the rule is present as a line: %s", (rule) => {
		expect(lines).toContain(`- ${rule}`);
	});
});

const jobs = readFileSync(
	join(ROOT, "skills", "clerk", "references", "jobs.md"),
	"utf8",
);
const sectionOf = (heading: string) =>
	(jobs.split(`### ${heading}\n`)[1] ?? "").split(/^##+ /m)[0] ?? "";
const write = sectionOf("Write the precedent files");
const recordStep = sectionOf("Record the precedent files");

const CLERK_RULES = [
	"Never print, echo or trace the key.",
	"Never run a command that prints the key to you.",
	"Never put the key on a command line or into a file.",
	"Never send the request body to any place other than the endpoint above.",
	"Write no file for the request body or the reply. Pipe them from the request command through the service to the answer command.",
	"Send a request only with a body that is not empty.",
	"Send each request once. Do not retry it. Set no timeout.",
	"A non-zero exit, or a harness timeout, is not a failed step. When the pipeline printed no line that starts with `jev`, record `jev none reason=failed` in Blockers.",
	"A `jev none` line and a `drop` line go to Blockers, never to a comment and never to a pull request.",
	"The `typesafe-ai` skill is knowledge only. The clerk works without it.",
	"Make no other request to the service in a tick. Only these steps use the key.",
];

describe("the Jev steps of the clerk's precedent files", () => {
	test("the step names the request and answer forms, the endpoint and the key line", () => {
		expect(write).toContain("--request <name>");
		expect(write).toContain("--answer <name>");
		expect(write).toContain("https://api.typesafe.ai/v1/systemone");
		expect(write).toContain("typesafe_key");
		expect(write).toContain("jev none reason=no-key");
	});

	test("the step runs one pipeline and names no file for the body or the reply", () => {
		expect(write).toContain("Run one pipeline.");
		expect(write).not.toMatch(/\btmp\b|\.json\b|TYPESAFE_API_KEY|curl/);
	});

	test("the clerk keeps its own rules, apart from those of the court", () => {
		expect(CLERK_RULES).not.toEqual(RULES);
		for (const rule of CLERK_RULES)
			expect(write.split("\n")).toContain(`- ${rule}`);
	});

	test("the commit reads only the precedent output, and jev none is no none line", () => {
		expect(recordStep).toContain(
			"Run it only when the output of the `precedent` call above holds no `none` and no `no-entry` line.",
		);
		expect(recordStep).toContain("a `jev none` line is no `none` line");
		expect(recordStep).toContain(
			"A `drop` line is no `none` and no `no-entry` line either.",
		);
	});
});
