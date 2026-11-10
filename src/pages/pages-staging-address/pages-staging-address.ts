import { Console, Effect, Schema } from "effect";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { requiredInput } from "../../../lib/inputs.ts";
import { writeOutputs } from "../../../lib/step-output.ts";

const ACTION = "pages-staging-address";

class AddressUnread extends Schema.TaggedError<AddressUnread>()("AddressUnread", {
  message: Schema.String,
}) {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function valueAt(loaded: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((holder, key) => (isRecord(holder) ? holder[key] : undefined), loaded);
}

export function httpsAddress(value: unknown): string | undefined {
  if (typeof value !== "string" || !URL.canParse(value)) return undefined;
  return new URL(value).protocol === "https:" ? value : undefined;
}

const readAddress = Effect.fn("readAddress")(function* (module: string, path: string) {
  const loaded: unknown = yield* Effect.tryPromise({
    try: () => import(pathToFileURL(resolve(module)).href),
    catch: (cause) => new AddressUnread({ message: `${ACTION} cannot load ${module}: ${String(cause)}` }),
  });
  const value = valueAt(loaded, path);
  const address = httpsAddress(value);
  if (address === undefined) {
    return yield* new AddressUnread({ message: `${module} exports ${path} as ${JSON.stringify(value) ?? "nothing"}, where an https address was wanted` });
  }
  return address;
});

export const main = Effect.gen(function* () {
  const address = yield* readAddress(yield* requiredInput(ACTION, "module", "MODULE"), yield* requiredInput(ACTION, "export", "EXPORT"));
  yield* Console.log(`the staging address is ${address}`);
  yield* writeOutputs({ address });
  return true;
});
