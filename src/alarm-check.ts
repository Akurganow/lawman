const ALARM_CHECK = "Alarm check:";
const PROOF = "Proof";

type Heading = { name: string; line: number };

// the paragraph opens the Proof section or follows a blank line, outside a fence
export function hasAlarmCheck(
	lines: string[],
	hidden: boolean[],
	found: Heading[],
): boolean {
	const k = found.findIndex((h) => h.name === PROOF);
	if (k < 0) return false;
	const from = found[k]?.line ?? 0;
	const end = (found[k + 1]?.line ?? lines.length + 1) - 1;
	return lines
		.slice(from, end)
		.some(
			(line, j) =>
				line.startsWith(ALARM_CHECK) &&
				!hidden[from + j] &&
				(j === 0 || (lines[from + j - 1] ?? "").trim() === ""),
		);
}
