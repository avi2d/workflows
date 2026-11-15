export function namesOf(site: { readonly pages: string; readonly domain: string; readonly production: string }) {
  return {
    pages: site.pages,
    preview: `${site.pages}-preview`,
    domain: site.domain,
    production: site.production,
    "staging-origin": `https://${site.pages}.pages.dev`,
    "production-origin": `https://${site.domain}`,
  };
}
