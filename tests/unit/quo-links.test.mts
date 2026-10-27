import { test } from "node:test";
import assert from "node:assert/strict";
import { callHref, detectPlatform, draftText, firstNameOf, quoDialUrl, quoMessageUrl, streetOf, telUrl } from "../../lib/quo-links.ts";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPAD = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";
const WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

test("platform: iPhone, Android and iPad (a Mac UA with touch) are mobile; Mac and Windows are desktop", () => {
  assert.equal(detectPlatform(IPHONE), "ios");
  assert.equal(detectPlatform(ANDROID), "android");
  assert.equal(detectPlatform(IPAD, 5), "ios");
  assert.equal(detectPlatform(MAC, 0), "desktop");
  assert.equal(detectPlatform(WIN), "desktop");
  assert.equal(detectPlatform(""), "desktop");
});

test("dial and message links URL-encode the + so Quo reads the number as E.164", () => {
  assert.equal(quoDialUrl("+19187409628"), "openphone://dial?number=%2B19187409628");
  assert.equal(quoMessageUrl("+19187409628"), "openphone://message?number=%2B19187409628&selectedAsFallback=true");
  assert.equal(
    quoMessageUrl("+19187409628", "Hi Jane, it's Will from Nova Havens about 12 Elm St. "),
    "openphone://message?number=%2B19187409628&selectedAsFallback=true&text=Hi%20Jane%2C%20it's%20Will%20from%20Nova%20Havens%20about%2012%20Elm%20St.%20",
  );
});

test("the Call button is tel: on a laptop (Quo click-to-call) and openphone://dial on a phone", () => {
  assert.equal(callHref("+19187409628", "desktop"), "tel:+19187409628");
  assert.equal(telUrl("+19187409628"), "tel:+19187409628");
  assert.equal(callHref("+19187409628", "ios"), "openphone://dial?number=%2B19187409628");
  assert.equal(callHref("+19187409628", "android"), "openphone://dial?number=%2B19187409628");
});

test("street and first name are trimmed sensibly", () => {
  assert.equal(streetOf("123 Main St, Tulsa, OK 74133, USA"), "123 Main St");
  assert.equal(streetOf(null), "");
  assert.equal(firstNameOf("Jane Doe"), "Jane");
  assert.equal(firstNameOf("  Jane "), "Jane");
  assert.equal(firstNameOf("Acme Properties LLC"), "Acme Properties LLC");
  assert.equal(firstNameOf("Tulsa Homes Group Inc Extra"), "Tulsa Homes Group");
  assert.equal(firstNameOf(null), "");
});

test("draft text: names the person, the sender when known, and the street; never empty", () => {
  assert.equal(draftText({ to: "Jane Doe", address: "12 Elm St, Tulsa, OK", from: "Will" }), "Hi Jane, it's Will from Nova Havens about 12 Elm St. ");
  assert.equal(draftText({ to: null, address: "12 Elm St, Tulsa, OK", from: "" }), "Hi, this is Nova Havens about 12 Elm St. ");
  assert.equal(draftText({ to: "Jane", address: null, from: null }), "Hi Jane, this is Nova Havens. ");
  assert.equal(draftText({}), "Hi, this is Nova Havens. ");
});
