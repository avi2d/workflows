import { defineConfig } from "@avi2dg/checks/knip";

export default defineConfig({ entry: ["src/kit-bin/kit-bin.ts", "src/mutation-scope/mutation-scope.ts", "src/secrets-pack/write.ts", "src/ci/*.ts"] });
