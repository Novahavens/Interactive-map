// Full load of the PROPERTY DATABASE board into Supabase. Safe to re-run:
// every row is an upsert keyed on the monday item id. Resumable: pass the
// cursor from the previous response to continue. Driven from inside the
// database by public.resync_tick() (see the reconcile migration), which also
// prunes rows a completed run never saw.
// verify_jwt is off; the x-sync-secret header (public.sync_config) guards it.
import { syncSecret, upsertItems } from "../_shared/db.ts";
import { ITEM_FIELDS, PROPERTY_BOARD, pageBudget, safeEqual, type MondayItem } from "../_shared/mapping.ts";
import { monday } from "../_shared/monday.ts";

const PAGE = 200;
type Page = { cursor: string | null; items: MondayItem[] };

Deno.serve(async (req) => {
  const secret = await syncSecret();
  if (!secret || !safeEqual(req.headers.get("x-sync-secret") ?? "", secret)) {
    return new Response("unauthorised", { status: 401 });
  }

  const url = new URL(req.url);
  let cursor = url.searchParams.get("cursor");
  const maxPages = pageBudget(url.searchParams.get("pages"));
  const started = Date.now();
  let pages = 0, synced = 0;

  try {
    while (pages < maxPages) {
      const data: Page | undefined = cursor
        ? await monday<{ next_items_page: Page }>(
            `query ($cursor: String!) { next_items_page (limit: ${PAGE}, cursor: $cursor) { cursor items { ${ITEM_FIELDS} } } }`,
            { cursor },
          ).then((d) => d.next_items_page)
        : await monday<{ boards: { items_page: Page }[] }>(
            `query { boards (ids: [${PROPERTY_BOARD}]) { items_page (limit: ${PAGE}) { cursor items { ${ITEM_FIELDS} } } } }`,
          ).then((d) => d.boards?.[0]?.items_page);
      if (!data) throw new Error(`board ${PROPERTY_BOARD} returned no items page`);

      synced += await upsertItems(data.items ?? []);
      pages += 1;
      cursor = data.cursor;
      if (!cursor) break;
      // Stay inside the function's wall-clock budget; the caller continues.
      if (Date.now() - started > 100_000) break;
    }
    return Response.json({ synced, pages, nextCursor: cursor, done: cursor === null });
  } catch (error) {
    console.error("backfill failed", error);
    return Response.json({ synced, pages, nextCursor: cursor, error: String(error) }, { status: 500 });
  }
});
