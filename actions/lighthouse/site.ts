import { Data, Effect, FileSystem, Path } from "effect";

export class SiteError extends Data.TaggedError("SiteError")<{ readonly message: string }> {}

const INDEX = "index.html";

export type Routes = ReadonlyMap<string, string>;

export function routesOf(files: readonly string[]): Routes {
  const routes = new Map<string, string>();
  for (const file of files) {
    const route = `/${file}`;
    routes.set(route, file);
    if (route.endsWith(`/${INDEX}`)) routes.set(route.slice(0, -INDEX.length), file);
  }
  return routes;
}

export const pagesOf = (files: readonly string[]): readonly string[] =>
  files
    .filter((file) => file.endsWith(".html"))
    .map((file) => `/${file}`.replace(/\/index\.html$/, "/"))
    .toSorted();

export function choosePages(found: readonly string[], named: string): Effect.Effect<readonly string[], SiteError> {
  if (found.length === 0) return Effect.fail(new SiteError({ message: "the site holds no .html page, so build it before the audit" }));
  const wanted = named.split(/\s+/).filter((page) => page !== "");
  if (wanted.length === 0) return Effect.succeed(found);
  const missing = wanted.filter((page) => !found.includes(page));
  if (missing.length > 0) {
    return Effect.fail(new SiteError({ message: `pages names ${missing.join(", ")}, which the site does not hold; it holds ${found.join(", ")}` }));
  }
  return Effect.succeed([...new Set(wanted)]);
}

export function answer(root: string, routes: Routes, request: Request): Response {
  const pathname = decodeURIComponent(new URL(request.url).pathname);
  const file = routes.get(pathname);
  if (file !== undefined) return new Response(Bun.file(`${root}/${file}`));
  return new Response("not found", { status: 404 });
}

export const siteFiles = Effect.fn("siteFiles")(function* (site: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = path.resolve(site);
  const isDirectory = yield* fs.stat(root).pipe(
    Effect.map(({ type }) => type === "Directory"),
    Effect.orElseSucceed(() => false),
  );
  if (!isDirectory) return yield* new SiteError({ message: `site names ${site}, which is not a folder, so build the site before the audit` });
  const files: string[] = [];
  for (const entry of yield* fs.readDirectory(root, { recursive: true })) {
    if ((yield* fs.stat(path.join(root, entry))).type === "File") files.push(entry.split(path.sep).join("/"));
  }
  return { root, files };
});

export const serveSite = (root: string, routes: Routes) =>
  Effect.acquireRelease(
    Effect.sync(() => Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: (request) => answer(root, routes, request) })),
    (server) => Effect.promise(() => server.stop()),
  ).pipe(Effect.map((server) => `http://127.0.0.1:${String(server.port)}/`));
