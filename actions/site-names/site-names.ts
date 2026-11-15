import { Console, Effect, FileSystem, Schema } from "effect";
import { requiredInput } from "../../lib/inputs.ts";
import { writeOutputs } from "../../lib/step-output.ts";

const ACTION = "site-names";

class SiteUnnamed extends Schema.TaggedError<SiteUnnamed>()("SiteUnnamed", {
  message: Schema.String,
}) {}

const ProjectName = Schema.String.pipe(Schema.check(Schema.isPattern(/^[a-z0-9](?:[a-z0-9-]{0,47}[a-z0-9])?$/)));
const Domain = Schema.String.pipe(Schema.check(Schema.isPattern(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/)));
const Repository = Schema.String.pipe(Schema.check(Schema.isPattern(/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/)));

const Site = Schema.Struct({ pages: ProjectName, domain: Domain, production: Repository });

const Manifest = Schema.Struct({ site: Site });

const decodeManifest = Schema.decodeUnknownEffect(Schema.fromJsonString(Manifest));

export type SiteNames = {
  readonly pages: string;
  readonly preview: string;
  readonly domain: string;
  readonly production: string;
  readonly "staging-origin": string;
  readonly "production-origin": string;
};

export function namesOf(site: typeof Site.Type): SiteNames {
  return {
    pages: site.pages,
    preview: `${site.pages}-preview`,
    domain: site.domain,
    production: site.production,
    "staging-origin": `https://${site.pages}.pages.dev`,
    "production-origin": `https://${site.domain}`,
  };
}

export const readSite = Effect.fn("readSite")(function* (manifest: string) {
  const text = yield* (yield* FileSystem.FileSystem).readFileString(manifest).pipe(
    Effect.mapError(() => new SiteUnnamed({ message: `${ACTION} cannot read ${manifest}` })),
  );
  const { site } = yield* decodeManifest(text).pipe(
    Effect.mapError(
      (issue) =>
        new SiteUnnamed({
          message: `${manifest} needs a site field such as {"pages": "azalialaw", "domain": "azalialaw.com", "production": "azalialaw/azalialaw.com"}: ${issue.message}`,
        }),
    ),
  );
  return namesOf(site);
});

export const main = Effect.gen(function* () {
  const names = yield* readSite(yield* requiredInput(ACTION, "manifest", "MANIFEST"));
  yield* Console.log(`the site stages on ${names["staging-origin"]}, previews on the ${names.preview} project and publishes ${names.production} at ${names["production-origin"]}`);
  yield* writeOutputs(names);
  return true;
});
