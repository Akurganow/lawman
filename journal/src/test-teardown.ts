import { afterAll } from "bun:test";
import { removeRuntime } from "./test-helpers";

afterAll(removeRuntime);
