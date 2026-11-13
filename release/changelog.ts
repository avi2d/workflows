#!/usr/bin/env bun
import { Console, Effect, FileSystem, Path, Schema } from "effect";
import { commandOutput, runCheck } from "../lib/run.ts";

const MANIFEST = "package.json";
const CHANGELOG = "CHANGELOG.md";
const RELEASE_TAG_GLOB = "v[0-9]*.[0-9]*.[0-9]*";

const GROUPS = ["Breaking changes", "Features", "Fixes", "Performance", "Reverts"] as const;

type Group = (typeof GROUPS)[number];

const GROUP_OF_TYPE: ReadonlyMap<string, Group> = new Map([
  ["feat", "Features"],
  ["fix", "Fixes"],
  ["perf", "Performance"],
  ["revert", "Reverts"],
]);

const CONVENTIONAL = /^([a-z]+)(?:\(([^()]*)\))?(!)?: (\S.*)$/;
const PULL_REQUEST = / \(#(\d+)\)$/;
const PLAIN_VERSION = /^(\d+)\.\d+\.\d+$/;

class ChangelogRefused extends Schema.TaggedError<ChangelogRefused>()("ChangelogRefused", {
  message: Schema.String,
}) {}

const Manifest = Schema.Struct({ version: Schema.String, repository: Schema.String });

const decodeManifest = Schema.decodeUnknownEffect(Schema.fromJsonString(Manifest));

// checks-release-pr picks the next version by this same reading of each subject since the last tag, so the notes list what chose the bump.
export function groupOf(subject: string): Group | undefined {
  const [, type = "", , breaking] = CONVENTIONAL.exec(subject) ?? [];
  return breaking === "!" ? "Breaking changes" : GROUP_OF_TYPE.get(type);
}

function entryOf(subject: string, repositoryUrl: string): string {
  const [, , scope = "", , description = ""] = CONVENTIONAL.exec(subject) ?? [];
  const linked = description.replace(PULL_REQUEST, (_, number: string) => ` [#${number}](${repositoryUrl}/pull/${number})`);
  return scope === "" ? `- ${linked}` : `- **${scope}:** ${linked}`;
}

export type Release = {
  readonly version: string;
  readonly released: string;
  readonly subjects: readonly string[];
  readonly repositoryUrl: string;
};

// Undefined when no subject is a change a release lists.
export function renderSection({ version, released, subjects, repositoryUrl }: Release): string | undefined {
  const major = PLAIN_VERSION.exec(version)?.[1];
  const groups = GROUPS.flatMap((group) => {
    const listed = subjects.filter((subject) => groupOf(subject) === group).map((subject) => entryOf(subject, repositoryUrl));
    return listed.length === 0 ? [] : [`### ${group}`, listed.join("\n")];
  });
  if (major === undefined || groups.length === 0) return undefined;
  return [`## ${version}`, `Released ${released}.`, ...groups, `The \`v${major}\` tag moves to this release.`].join("\n\n");
}

function chunksOf(changelog: string): string[] {
  return changelog.split(/^(?=## )/m);
}

function headsVersion(chunk: string, version: string): boolean {
  return chunk.split("\n", 1)[0] === `## ${version}`;
}

export function withSection(changelog: string, version: string, section: string): string {
  const [intro = "", ...sections] = chunksOf(changelog);
  const at = sections.findIndex((chunk) => headsVersion(chunk, version));
  const kept = at === -1 ? [section, ...sections] : sections.with(at, section);
  return `${[intro.trimEnd(), ...kept.map((chunk) => chunk.trimEnd())].join("\n\n")}\n`;
}

export function dropStaleSections(changelog: string, since: string | undefined, version: string): string {
  if (since === undefined) return changelog;
  const [intro = "", ...sections] = chunksOf(changelog);
  const kept = sections.filter((chunk) => {
    const headed = /^## (\S+)/.exec(chunk)?.[1] ?? "";
    if (headed === version || !PLAIN_VERSION.test(headed)) return true;
    return Bun.semver.order(headed, since.slice(1)) !== 1;
  });
  if (kept.length === sections.length) return changelog;
  return `${[intro.trimEnd(), ...kept.map((chunk) => chunk.trimEnd())].join("\n\n")}\n`;
}

const git = Effect.fn("git")(function* (root: string, args: readonly string[]) {
  const { stdout, passed } = yield* commandOutput("git", ["-C", root, ...args]);
  if (!passed) return yield* new ChangelogRefused({ message: `git ${args.join(" ")} failed` });
  return stdout.trim();
});

const lastTag = (root: string) =>
  git(root, ["describe", "--tags", "--abbrev=0", `--match=${RELEASE_TAG_GLOB}`, "HEAD"]).pipe(
    Effect.orElseSucceed(() => ""),
    Effect.map((tag) => (tag === "" ? undefined : tag)),
  );

const subjectsSince = Effect.fn("subjectsSince")(function* (root: string, since: string | undefined) {
  const log = yield* git(root, ["log", "--topo-order", "--no-merges", "--format=%s", since === undefined ? "HEAD" : `${since}..HEAD`]);
  return log.split("\n").filter((subject) => subject !== "");
});

const readManifest = Effect.fn("readManifest")(function* (root: string) {
  const text = yield* (yield* FileSystem.FileSystem).readFileString((yield* Path.Path).join(root, MANIFEST));
  const { version, repository } = yield* decodeManifest(text).pipe(
    Effect.mapError((cause) => new ChangelogRefused({ message: `${MANIFEST}: ${cause.message}` })),
  );
  if (!repository.startsWith("https://")) return yield* new ChangelogRefused({ message: `${MANIFEST} repository ${repository} is no https address` });
  return { version, repositoryUrl: repository };
});

// checks-changelog writes the whole file from the version bumps in package.json, and the sections before the first bump were written by hand.
const build = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const root = yield* git(".", ["rev-parse", "--show-toplevel"]);
  if ((yield* git(root, ["rev-parse", "--is-shallow-repository"])) === "true") {
    return yield* new ChangelogRefused({ message: "the checkout is shallow, so the last release tag may be out of its reach; fetch all of it" });
  }
  const { version, repositoryUrl } = yield* readManifest(root);
  const since = yield* lastTag(root);
  const target = (yield* Path.Path).join(root, CHANGELOG);
  const found = yield* fs.readFileString(target);
  const changelog = dropStaleSections(found, since, version);
  if (since === `v${version}`) {
    if (changelog !== found) {
      yield* fs.writeFileString(target, changelog);
      yield* Console.log(`changelog: dropped the sections past ${since} that ${version} never published`);
      return true;
    }
    yield* Console.log(`changelog: ${since} is tagged, so ${CHANGELOG} stays as it is`);
    return true;
  }
  if (since !== undefined && Bun.semver.order(version, since.slice(1)) !== 1) {
    return yield* new ChangelogRefused({ message: `${MANIFEST} holds ${version}, which is not past the last release tag ${since}` });
  }
  const released = new Date().toISOString().slice(0, 10);
  const section = renderSection({ version, released, subjects: yield* subjectsSince(root, since), repositoryUrl });
  if (section === undefined) {
    return yield* new ChangelogRefused({ message: `${MANIFEST} holds ${version}, yet no feat, fix, perf, revert or breaking commit landed since ${since ?? "the first commit"}` });
  }
  const written = withSection(changelog, version, section);
  if (written !== found) yield* fs.writeFileString(target, written);
  yield* Console.log(`changelog: wrote ${version} into ${CHANGELOG} from the commits since ${since ?? "the first commit"}`);
  return true;
});

if (import.meta.main) runCheck(build);
