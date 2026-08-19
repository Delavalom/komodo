import { SqliteStore } from "../src/sqlite.js";
import { describeStore } from "./conformance.js";

describeStore("SqliteStore", async () => new SqliteStore({ path: ":memory:" }));
