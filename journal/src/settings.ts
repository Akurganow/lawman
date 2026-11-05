// The settings of a role that config.yaml may change, with the defaults of this release.
// The callers read the raw value with configValue, so this module imports nothing.

export const JOBS: Record<string, number> = {
	patrol: 1,
	"response-unit": 2,
	investigation: 1,
	prosecutor: 1,
	defender: 1,
	court: 1,
	clerk: 3,
	"spec-writer": 1,
	executor: 1,
};

export const PROGRESS_CHECKS = 3;

const COUNT = /^[1-9][0-9]*$/;

export const jobsLine = () =>
	Object.entries(JOBS)
		.map(([role, n]) => `${role}=${n}`)
		.join(" ");

// `<role>=<n>` pairs split on spaces; a pair outside the nine roles or the class is not read,
// and the first readable pair of a role wins
export function jobsOf(value: string | undefined, role: string): number {
	const fallback = Object.hasOwn(JOBS, role) ? (JOBS[role] ?? 1) : 1;
	if (value === undefined || value === "none") return fallback;
	for (const pair of value.split(/\s+/)) {
		const at = pair.indexOf("=");
		const n = pair.slice(at + 1);
		if (
			at > 0 &&
			pair.slice(0, at) === role &&
			Object.hasOwn(JOBS, role) &&
			COUNT.test(n)
		)
			return Number(n);
	}
	return fallback;
}

export const progressChecks = (value: string | undefined) =>
	value !== undefined && COUNT.test(value) ? Number(value) : PROGRESS_CHECKS;
