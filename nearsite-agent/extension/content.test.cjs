const { test } = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require(require.resolve("jsdom", { paths: [process.env.JSDOM_DIR] }));
const { pickBox, fill, SITES } = require("./content.js");

const dom = (html) => new JSDOM(`<body>${html}</body>`).window.document;

test("finds the site's own message box", () => {
  const d = dom(`<textarea name="search"></textarea><textarea name="message"></textarea>`);
  assert.equal(pickBox(d, SITES["www.furnishedfinder.com"]).name, "message");
});

test("falls back to a textarea that reads like a message box", () => {
  const d = dom(`<textarea id="review"></textarea><textarea placeholder="Ask the host a question"></textarea>`);
  assert.match(pickBox(d, { box: "textarea.nope" }).placeholder, /Ask the host/);
});

test("no guess when several unrelated boxes exist", () => {
  assert.equal(pickBox(dom(`<textarea id="a"></textarea><textarea id="b"></textarea>`), { box: ".nope" }), null);
});

test("fills an empty box, never overwrites what the person typed, never clicks Send", () => {
  const d = dom(`<textarea name="message"></textarea><button id="send">Send</button>`);
  let clicked = false;
  d.getElementById("send").addEventListener("click", () => (clicked = true));
  assert.equal(fill(d, SITES["www.zillow.com"], "Hi!").box.value, "Hi!");
  const d2 = dom(`<textarea name="message">my words</textarea>`);
  assert.equal(fill(d2, SITES["www.zillow.com"], "Hi!").box.value, "my words");
  assert.equal(clicked, false);
});

test("background.js only opens https listings and never sends", () => {
  const src = require("node:fs").readFileSync(__dirname + "/background.js", "utf8");
  assert.match(src, /\^https:/);
  assert.doesNotMatch(require("node:fs").readFileSync(__dirname + "/content.js", "utf8"), /\.click\(\)|submit\(\)/);
});
