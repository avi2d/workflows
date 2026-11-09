import { defineConfig } from "@avi2dg/checks/knip";

export default defineConfig({ entry: ["actions/*/main.ts", "src/ci/*.ts"] });
