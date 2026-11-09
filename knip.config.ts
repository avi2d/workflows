import { defineConfig } from "@avi2dg/checks/knip";

export default defineConfig({ entry: ["kit-bin/kit-bin.ts", "mutation-scope/mutation-scope.ts", "secrets-pack/write.ts", "ci/*.ts"] });
