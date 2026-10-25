const STATUS = /^[0-9]{3}$/;
// curl prints 000 as the status when no reply came
const NO_REPLY_STATUS = "000";

// The reply stands above a last line that holds the status.
export function splitReply(input: string): { body: string; status: string } {
	// the request may end the status line with a newline of its own
	const text = input.replace(/\s+$/, "");
	const cut = text.lastIndexOf("\n");
	return { body: text.slice(0, Math.max(cut, 0)), status: text.slice(cut + 1) };
}

export const isNoReply = (status: string) =>
	!STATUS.test(status) || status === NO_REPLY_STATUS;
