import { defineConfig } from "@avi2dg/checks/knip";

export default defineConfig({ entry: ["actions/**/main.ts", "actions/setup/self-bins.ts", "ci/*.ts", "release/*.ts"] });
