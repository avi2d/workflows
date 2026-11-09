import { defineConfig } from "@avi2dg/checks/knip";

export default defineConfig({ entry: ["src/*/*.ts", "!src/lib/*.ts"] });
