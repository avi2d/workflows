#!/usr/bin/env bun
import { Console, Effect, Schema } from "effect";
import { github, repositoryFromEnv } from "../lib/github.ts";
import { optionalInput } from "../lib/inputs.ts";
import { runCheck } from "../lib/run.ts";

const NAME = "major-tag";
const RELEASE_TAG = /^v(\d+)\.\d+\.\d+$/;
const TAG_REF = "refs/tags/";

const Ref = Schema.Struct({ ref: Schema.String, object: Schema.Struct({ sha: Schema.String }) });

export type Tag = { readonly name: string; readonly sha: string };

export type Move =
  | { readonly kind: "create"; readonly major: string }
  | { readonly kind: "update"; readonly major: string; readonly from: string }
  | { readonly kind: "current"; readonly major: string }
  | { readonly kind: "behind"; readonly major: string; readonly newest: string };

function newer(left: string, right: string): string {
  return Bun.semver.order(left.slice(1), right.slice(1)) === 1 ? left : right;
}

// The tag is a release tag of the major it names.
export function majorMove(tags: readonly Tag[], tag: string, sha: string, major: string): Move {
  const newest = tags
    .map(({ name }) => name)
    .filter((name) => RELEASE_TAG.exec(name)?.[1] === major.slice(1))
    .reduce(newer, tag);
  if (newest !== tag) return { kind: "behind", major, newest };
  const held = tags.find(({ name }) => name === major);
  if (held === undefined) return { kind: "create", major };
  return held.sha === sha ? { kind: "current", major } : { kind: "update", major, from: held.sha };
}

const point = Effect.fn("point")(function* (move: Move, sha: string) {
  const repository = yield* repositoryFromEnv(NAME);
  if (move.kind === "create") yield* github(repository, Ref, "POST", "/git/refs", { ref: `${TAG_REF}${move.major}`, sha });
  if (move.kind === "update") yield* github(repository, Ref, "PATCH", `/git/refs/tags/${move.major}`, { sha, force: true });
});

function report(move: Move, tag: string, sha: string): string {
  const short = sha.slice(0, 12);
  if (move.kind === "create") return `created ${move.major} on ${tag} at ${short}`;
  if (move.kind === "update") return `moved ${move.major} from ${move.from.slice(0, 12)} to ${tag} at ${short}`;
  if (move.kind === "current") return `${move.major} already points at ${tag} at ${short}`;
  return `${tag} is behind ${move.newest}, so ${move.major} stays on ${move.newest}`;
}

const main = Effect.gen(function* () {
  const refType = yield* optionalInput("GITHUB_REF_TYPE");
  const tag = yield* optionalInput("GITHUB_REF_NAME");
  const sha = yield* optionalInput("GITHUB_SHA");
  const major = RELEASE_TAG.exec(tag)?.[1];
  if (refType !== "tag" || major === undefined || sha === "") {
    yield* Console.log(`::error::${NAME} runs only on a vMAJOR.MINOR.PATCH tag, and the run is on the ${refType || "unnamed"} ${tag || "ref"}`);
    return false;
  }
  const repository = yield* repositoryFromEnv(NAME);
  const refs = yield* github(repository, Schema.Array(Ref), "GET", `/git/matching-refs/tags/v${major}`);
  const tags = refs.map(({ ref, object }) => ({ name: ref.slice(TAG_REF.length), sha: object.sha }));
  const move = majorMove(tags, tag, sha, `v${major}`);
  yield* point(move, sha);
  yield* Console.log(`${NAME}: ${report(move, tag, sha)}`);
  return true;
});

if (import.meta.main) runCheck(main);
