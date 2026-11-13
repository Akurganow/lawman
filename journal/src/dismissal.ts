import { normalizeTime } from "./db";
import { configValue } from "./law-sync";
import { canonicalId } from "./markers";

const COMPLETED = "COMPLETED";
const KEY = "dismissals_since";

// the time of the key, or null when it is absent or is no UTC time
export function dismissalsSince(config: string | null): string | null {
	const value = configValue(config ?? "", KEY);
	return value === undefined ? null : normalizeTime(value);
}

export type CloseFacts = {
	reason: string | null;
	closedAt: string | null;
	// the id of the lead origin, null when the issue has none
	leadId: string | null;
	since: string | null;
	// the base of the issue's pair
	base: string | undefined;
};

// Whether a closed issue leaves a dismissal. An acquittal that leaves a rule leaves none:
// the rule protects the finding. holdsRule is read only for an acquittal.
export function dismissible(
	facts: CloseFacts,
	ruling: { stage: string } | undefined,
	holdsRule: () => boolean,
): boolean {
	const closedAt =
		facts.closedAt === null ? null : normalizeTime(facts.closedAt);
	return (
		facts.reason !== COMPLETED &&
		closedAt !== null &&
		facts.since !== null &&
		closedAt >= facts.since &&
		facts.leadId !== null &&
		canonicalId(facts.leadId) &&
		facts.base !== "settled" &&
		!(ruling?.stage === "acquittal" && holdsRule())
	);
}
