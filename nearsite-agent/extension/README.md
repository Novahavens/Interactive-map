# Messenger bridge (unpublished)

Lets a searcher message a landlord through the listing site's own messenger without leaving the map.

1. In the map, the home's "Message landlord" button calls `chrome.runtime.sendMessage(EXTENSION_ID, {type:"open-listing", homeId, url, draft})`.
2. The extension opens the listing in a narrow window docked beside the map and fills the message box with the draft.
3. The person reads it and presses Send. The extension never presses Send.
4. The extension reads the visible thread every 30 seconds and passes new text back to the map, where the outreach agent maps the answers onto the home.

Why not an iframe: listing sites block being framed and their sign-in cookies don't work inside another site's frame.

Set up for the map at https://nova-havens-map.vercel.app (only that site can talk to the extension).

Site selectors are a first guess: Furnished Finder refused the cloud browser (Cloudflare), and the message boxes sit behind each site's sign-in, so they couldn't be checked from here. If the box isn't found, the extension puts the draft on the clipboard and tells the person to paste it, so it still works. Check each site once in a signed-in Chrome and adjust `SITES` in content.js.

To try it: Chrome, Extensions, Developer mode, Load unpacked, pick this folder. Don't publish it to the Chrome Web Store without the owner's go-ahead.

Tests: `content.test.cjs` (node:test + jsdom): finds the box, falls back safely, never overwrites typed text, never clicks Send.
