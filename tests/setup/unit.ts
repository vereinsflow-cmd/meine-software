import { applyTestEnv } from "./env";

applyTestEnv({ DATABASE_URL: "postgresql://unused:unused@localhost:1/unused" });
