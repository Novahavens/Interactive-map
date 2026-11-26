// Receives {type:"open-listing", homeId, url, draft} from the map page and opens the listing
// in a small window docked to the right. It never sends anything.
const pending = new Map(); // tabId -> {homeId, draft}

chrome.runtime.onMessageExternal.addListener((msg, sender, reply) => {
  if (msg?.type !== "open-listing" || !/^https:\/\//.test(msg.url || "")) return reply({ ok: false });
  chrome.windows.getCurrent((cur) => {
    const width = 520;
    chrome.windows.create(
      { url: msg.url, type: "popup", width, height: cur.height, left: (cur.left || 0) + cur.width - width, top: cur.top },
      (w) => { pending.set(w.tabs[0].id, { homeId: msg.homeId, draft: String(msg.draft || "").slice(0, 2000), mapTab: sender.tab?.id }); reply({ ok: true }); }
    );
  });
  return true;
});

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type === "ready") return reply(pending.get(sender.tab.id) || null);
  if (msg?.type === "replies") {
    const p = pending.get(sender.tab.id);
    if (p?.mapTab) chrome.tabs.sendMessage(p.mapTab, { type: "landlord-replies", homeId: p.homeId, replies: msg.replies });
  }
});
