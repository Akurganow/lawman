// The worker of the cleaning: one text in, the cleaned text out, null when the cleaning throws.
import { cleanHostText } from "./clean-host";

declare const self: Worker;
self.onmessage = async (e: MessageEvent<string>) => {
	try {
		postMessage(await cleanHostText(e.data));
	} catch {
		postMessage(null);
	}
};
