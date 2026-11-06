/*
 * After an install, update or reload, Chrome doesn't put the new content script into GitHub tabs that are already
 * open: those tabs keep the old copy, which no longer hears setting changes. So a change on the settings page
 * seemed to do nothing until each tab was reloaded. Inject the new copy into every open GitHub tab instead.
 */
type Tab = { id?: number };
type ChromeBg = {
  runtime: { onInstalled: { addListener(fn: (d: { reason: string }) => void): void }; getManifest(): { content_scripts?: { matches: string[]; js?: string[]; css?: string[] }[] } };
  tabs: { query(q: { url: string[] }): Promise<Tab[]> };
  scripting: {
    executeScript(o: { target: { tabId: number }; files: string[] }): Promise<unknown>;
    insertCSS(o: { target: { tabId: number }; files: string[] }): Promise<unknown>;
  };
};
const c = (globalThis as unknown as { chrome: ChromeBg }).chrome;

c.runtime.onInstalled.addListener(async ({ reason }) => {
  // Only when our code changed: on a Chrome update the tabs' copy is still alive, and a second one would double up.
  if (reason !== 'install' && reason !== 'update') return;
  const inject = async (tabId: number, cs: { css?: string[]; js?: string[] }) => {
    const target = { tabId };
    // A tab can refuse (a GitHub error page, a discarded tab); the others still get it.
    await c.scripting.insertCSS({ target, files: cs.css ?? [] }).catch(() => {});
    await c.scripting.executeScript({ target, files: cs.js ?? [] }).catch(() => {});
  };
  await Promise.all((c.runtime.getManifest().content_scripts ?? []).map(async (cs) =>
    Promise.all((await c.tabs.query({ url: cs.matches })).flatMap((t) => (t.id === undefined ? [] : [inject(t.id, cs)])))));
});
