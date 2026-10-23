// Receives monday.com webhooks for the PROPERTY DATABASE board and mirrors the
// change into Supabase within a second or two. PRD E4-T5, FR-6.
//
// Trust model: verify_jwt is off because monday.com does not send a Supabase
// JWT, and board webhooks are unsigned, so anyone who learns this URL can POST
// to it. An event is therefore only a hint: whatever it claims, the item is
// re-read from Monday and Monday's answer decides the write. A forged event
// can cost one Monday read; it can never change or delete a row on its own.
import { deleteItem, upsertItems } from "../_shared/db.ts";
import { ITEM_FIELDS, PROPERTY_BOARD, mirrorAction, type MondayItem } from "../_shared/mapping.ts";
import { monday } from "../_shared/monday.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("monday webhook receiver", { status: 200 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new Response("bad json", { status: 400 }); }

  // monday verifies a new webhook by sending a challenge that must be echoed.
  if (typeof body.challenge === "string") {
    return Response.json({ challenge: body.challenge });
  }

  const event = body.event as Record<string, unknown> | undefined;
  if (!event) return new Response("no event", { status: 400 });

  const boardId = String(event.boardId ?? "");
  const itemId = String(event.pulseId ?? event.itemId ?? "");
  const type = String(event.type ?? "");
  if (boardId !== PROPERTY_BOARD || !/^\d+$/.test(itemId)) return Response.json({ ignored: true });

  try {
    // One read per event is cheaper than reasoning about which column changed,
    // impossible to get subtly wrong, and order-proof: a late retry of an old
    // event still writes the item as it is now.
    const data = await monday<{ items: MondayItem[] }>(
      `query ($ids: [ID!]) { items (ids: $ids) { ${ITEM_FIELDS} } }`, { ids: [itemId] },
    );
    const action = mirrorAction(data.items?.[0]);
    if (action.kind === "delete") {
      await deleteItem(itemId);
      return Response.json({ deleted: itemId, reason: action.reason, type });
    }
    await upsertItems([action.item]);
    return Response.json({ synced: itemId, type });
  } catch (error) {
    console.error("webhook sync failed", itemId, type, error);
    // 500 makes monday retry, which is what we want for a transient failure.
    return new Response("sync failed", { status: 500 });
  }
});
