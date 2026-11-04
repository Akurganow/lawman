import { fenceLength } from "./clean-quote";

const MIN_FENCE = 3;

// The fence outruns every run of tildes in the cleaned text, so no line of it
// closes the fence, and a backtick line inside cannot close it either.
export function fenced(label: string, text: string): string {
	const content = text.replace(/\r?\n$/, "");
	const fence = "~".repeat(fenceLength(content, "~", MIN_FENCE));
	return [`${fence}${label}`, ...(content === "" ? [] : [content]), fence].join(
		"\n",
	);
}
