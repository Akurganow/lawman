// The child of the cleaning: one JSON string per line in, one reply per line out.
// It imports nothing heavy until it runs, so a command that is no worker loads none of it.
export const WORKER_ENV = "LAWMAN_CLEAN_WORKER";

export async function serveCleaning(): Promise<void> {
	const { cleanHostText } = await import("./clean-host");
	for await (const line of console) {
		let reply: { ok: string } | { err: true };
		try {
			reply = { ok: await cleanHostText(JSON.parse(line) as string) };
		} catch {
			reply = { err: true };
		}
		process.stdout.write(`${JSON.stringify(reply)}\n`);
	}
}
