import { beforeEach, expect, test } from "bun:test";
import { join } from "node:path";
import { useScratch } from "../../lib/scratch.ts";

const SCRIPT = join(import.meta.dir, "../../../../actions/preview/cloudflare-secrets-check/main.sh");
const NOTE = "the Cloudflare secrets are not set, so this pull request gets no preview";
const scratch = useScratch("cloudflare-secrets-check");

beforeEach(() => {
  scratch.write("output", "earlier=kept\n");
});

function check(token: string, account: string) {
  const env = { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account, MISSING_NOTE: NOTE, GITHUB_OUTPUT: scratch.at("output") };
  const { exitCode, stdout } = Bun.spawnSync(["bash", SCRIPT], { env });
  return { exitCode, stdout: stdout.toString(), output: scratch.read("output") };
}

test("both secrets set read as unset, or printed to the log, fails", () => {
  expect(check("token-value", "account-value")).toEqual({ exitCode: 0, stdout: "", output: "earlier=kept\nset=true\n" });
});

test.each([
  ["", "account-value"],
  ["token-value", ""],
  ["", ""],
])("a token %p and an account %p read as set, or failing the job, fails", (token, account) => {
  expect(check(token, account)).toEqual({ exitCode: 0, stdout: `${NOTE}\n`, output: "earlier=kept\nset=false\n" });
});
