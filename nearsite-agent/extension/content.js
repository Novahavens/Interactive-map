// Pre-fills the listing's message box with the draft. NEVER clicks Send: a person does.
// Site selectors are a first guess (the sites refuse automated browsers, so they could not be
// checked from the cloud). If no box is found, the draft goes on the clipboard and the banner
// says to paste it, so the flow still works while selectors are tuned.
const SITES = {
  "www.furnishedfinder.com": { box: "textarea[name='message'], textarea[id*='message' i]", thread: "[class*='message' i]" },
  "www.zillow.com": { box: "textarea[name='message'], textarea[id*='message' i]", thread: "[class*='Message']" },
  "www.airbnb.com": { box: "textarea[id*='message' i], textarea", thread: "[data-testid*='message']" },
  "www.vrbo.com": { box: "textarea[id*='message' i], textarea", thread: "[class*='message' i]" },
};

function visible(el) {
  if (el.disabled || el.readOnly || el.hidden) return false;
  const st = el.ownerDocument.defaultView.getComputedStyle(el);
  return st.display !== "none" && st.visibility !== "hidden";
}

/** Finds the message box: the site's selector first, then any visible textarea that reads like a message box. */
function pickBox(doc, site) {
  const tried = site ? [...doc.querySelectorAll(site.box)].filter(visible) : [];
  if (tried.length) return tried[0];
  const hint = /message|note|question|contact|inquir|ask/i;
  const all = [...doc.querySelectorAll("textarea")].filter(visible);
  return all.find((t) => hint.test([t.name, t.id, t.placeholder, t.getAttribute("aria-label")].join(" "))) || (all.length === 1 ? all[0] : null);
}

function banner(doc, text) {
  const note = doc.createElement("div");
  note.setAttribute("data-nh-banner", "1");
  note.textContent = text;
  note.style.cssText = "position:fixed;top:8px;left:8px;right:8px;z-index:2147483647;background:#111;color:#fff;padding:8px 10px;border-radius:8px;font:13px system-ui";
  doc.body.appendChild(note);
  return note;
}

function fill(doc, site, draft) {
  const box = pickBox(doc, site);
  if (!box) return { filled: false };
  if (!box.value) {
    box.focus();
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(box), "value")?.set;
    setter ? setter.call(box, draft) : (box.value = draft); // works with React-controlled inputs
    box.dispatchEvent(new box.ownerDocument.defaultView.Event("input", { bubbles: true }));
  }
  return { filled: true, box };
}

if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
  chrome.runtime.sendMessage({ type: "ready" }, (job) => {
    if (!job) return;
    const site = SITES[location.host];
    let shown = false;
    const tryFill = (n) => {
      const r = fill(document, site, job.draft);
      if (r.filled) { banner(document, "Nova Havens: message filled in. Check it, then press Send yourself."); shown = true; return; }
      if (n > 0) return setTimeout(() => tryFill(n - 1), 1000);
      navigator.clipboard?.writeText(job.draft).catch(() => {});
      if (!shown) banner(document, "Nova Havens: open the message box and paste (the draft is on your clipboard). Then press Send yourself.");
    };
    tryFill(10);
    let last = "";
    setInterval(() => {
      const sel = site ? site.thread : "[class*='message' i]";
      const t = [...document.querySelectorAll(sel)].map((e) => e.innerText.trim()).filter(Boolean).join("\n---\n");
      if (t && t !== last) { last = t; chrome.runtime.sendMessage({ type: "replies", replies: t.slice(-8000) }); }
    }, 30000);
  });
}

if (typeof module !== "undefined") module.exports = { pickBox, fill, SITES };
