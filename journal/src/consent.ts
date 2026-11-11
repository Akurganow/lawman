import type { Place } from "./department-page";
import { configValue } from "./law-sync";

const LICENSES = "licenses";

// the precinct's consent: the whole token <precinct>=yes in the line of the key
export const consents = (
	config: string | null,
	precinct: string,
	key: "license_precincts" | "typesafe_precincts",
) =>
	(configValue(config ?? "", key) ?? "")
		.split(/\s+/)
		.includes(`${precinct}=yes`);

// Jev is allowed only by the exact value yes and the precinct's consent
export const jevAllowed = (config: string | null, precinct: string) =>
	configValue(config ?? "", "typesafe") === "yes" &&
	consents(config, precinct, "typesafe_precincts");

// the law page of licenses serves only a precinct that consented
export const licensesAllowed = (
	department: string,
	place: Place,
	consented: boolean,
) => department !== LICENSES || place !== "law" || consented;
