const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const sourcePath = path.join(__dirname, "nifty_axis_calibrator.pine");

test("Pine calibrator declares the required indicator and controlled anchor colors", () => {
  const source = fs.readFileSync(sourcePath, "utf8");

  assert.match(source, /^\/\/\@version=6/m);
  assert.match(source, /indicator\(\s*"NIFTY Axis Calibrator"/);
  assert.match(source, /color\.rgb\(\s*255\s*,\s*0\s*,\s*254\s*\)/);
  assert.match(source, /color\.rgb\(\s*0\s*,\s*255\s*,\s*254\s*\)/);
});

test("Pine calibrator rounds close to the nearest 50 and uses the exact timeframe span table", () => {
  const source = fs.readFileSync(sourcePath, "utf8");

  assert.match(source, /math\.round\(\s*close\s*\/\s*50\.0\s*\)\s*\*\s*50\.0/);
  assert.match(source, /timeframe\.isminutes\s*and\s*timeframe\.multiplier\s*<=\s*15\s*\?\s*300\.0/);
  assert.match(source, /timeframe\.isminutes\s*and\s*timeframe\.multiplier\s*<=\s*240\s*\?\s*600\.0/);
  assert.match(source, /timeframe\.isdaily\s*\?\s*800\.0/);
  assert.match(source, /timeframe\.isweekly\s*\?\s*2000\.0/);
  assert.match(source, /timeframe\.ismonthly\s*and\s*timeframe\.multiplier\s*==\s*1\s*\?\s*4000\.0/);
  assert.match(source, /:\s*7000\.0\s*$/m);
});

test("Pine calibrator draws only last-bar lower and upper anchors without option inputs or requests", () => {
  const source = fs.readFileSync(sourcePath, "utf8");

  assert.match(source, /if\s+barstate\.islast/);
  assert.match(source, /center\s*-\s*span/);
  assert.match(source, /center\s*\+\s*span/);
  assert.match(source, /line\.new/);
  assert.doesNotMatch(source, /input\.symbol/);
  assert.doesNotMatch(source, /request\.security/);
  assert.doesNotMatch(source, /\boptions\b/i);
});
