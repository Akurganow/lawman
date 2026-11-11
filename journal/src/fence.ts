import { fenceLength } from "./clean-quote";

const MIN_FENCE = 3;

// The fence outruns every run of tildes in the cleaned text, so no line of it
// closes the fence, and a backtick line inside cannot close it either.
export const fenceOf = (content: string) =>
	"~".repeat(fenceLength(content, "~", MIN_FENCE));
