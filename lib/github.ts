import { Config, Effect, Schema } from "effect";
import { callApiFor, type Method } from "./api.ts";
import { requiredInput } from "./inputs.ts";

export type Repository = { readonly apiBase: string; readonly name: string; readonly token: string };

export const repositoryFromEnv = Effect.fn("repositoryFromEnv")(function* (action: string) {
  return {
    apiBase: yield* Config.String("GITHUB_API_URL").pipe(Config.withDefault("https://api.github.com")),
    name: yield* Config.String("GITHUB_REPOSITORY"),
    token: yield* requiredInput(action, "token", "GH_TOKEN"),
  } satisfies Repository;
});

export const github = <S extends Schema.Top & { readonly DecodingServices: never }>(
  repository: Repository,
  schema: S,
  method: Method,
  path: string,
  body?: unknown,
) => callApiFor(schema, { base: `${repository.apiBase}/repos/${repository.name}`, path, method, token: repository.token, body });
