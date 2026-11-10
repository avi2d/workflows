import { defineConfig } from "@avi2dg/checks/dependency-cruiser";

export default defineConfig({
  // ci/ runs only in this repository's own CI, which installs the dev dependencies.
  devOnly: ["^(?:ci|tests)/"],
});
