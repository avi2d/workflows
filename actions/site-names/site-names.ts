import { Console, Effect, Schema } from "effect";
import { optionalInput, requiredInput } from "../../lib/inputs.ts";
import { writeOutputs } from "../../lib/step-output.ts";

const ACTION = "site-names";

class SiteUnnamed extends Schema.TaggedError<SiteUnnamed>()("SiteUnnamed", {
  message: Schema.String,
}) {}

const ProjectName = Schema.String.pipe(Schema.check(Schema.isPattern(/^[a-z0-9](?:[a-z0-9-]{0,47}[a-z0-9])?$/)));
const Domain = Schema.String.pipe(Schema.check(Schema.isPattern(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/)));
const Repository = Schema.String.pipe(Schema.check(Schema.isPattern(/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/)));

const Unnamed = Schema.Literal("");

const Site = Schema.Struct({ pages: ProjectName, domain: Schema.Union([Unnamed, Domain]), production: Schema.Union([Unnamed, Repository]) });
const decodeSite = Schema.decodeUnknownEffect(Site);

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
    "production-origin": site.domain === "" ? "" : `https://${site.domain}`,
  };
}

export const readSite = Effect.fn("readSite")(function* (input: unknown) {
  const site = yield* decodeSite(input).pipe(
    Effect.mapError((issue) => new SiteUnnamed({ message: `invalid site inputs: ${issue.message}` })),
  );
  return namesOf(site);
});

export const main = Effect.gen(function* () {
  const names = yield* readSite({
    pages: yield* requiredInput(ACTION, "pages", "PAGES"),
    domain: yield* optionalInput("DOMAIN"),
    production: yield* optionalInput("PRODUCTION"),
  });
  yield* Console.log(`the site stages on ${names["staging-origin"]} and previews on the ${names.preview} project`);
  if (names.production !== "") yield* Console.log(`it publishes ${names.production} at ${names["production-origin"] || "no domain"}`);
  yield* writeOutputs(names);
  return true;
});
