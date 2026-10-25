import { EXIT, Fail } from "./db";

const notYet = (): never => {
	throw new Fail(EXIT.USAGE, "catalog record is not available yet");
};

export const recordRequest = (_args: string[], _input: string): string =>
	notYet();
export const recordAnswer = (_args: string[], _input: string): string =>
	notYet();
