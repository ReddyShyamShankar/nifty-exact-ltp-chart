const test = require("node:test");
const assert = require("node:assert/strict");
const {
  findColorBounds,
  findHorizontalGridRows,
  dominantGridGap,
  priceIntervalFromPixels,
  pairAxisPricesWithRows,
  priceToY,
  spreadAroundAnchor
} = require("./overlay-utils.js");

function makePixels(width, height) {
  return new Uint8ClampedArray(width * height * 4).fill(255);
}

function paintPixel(pixels, width, x, y, red = 225, green = 225, blue = 225, alpha = 255) {
  const index = (y * width + x) * 4;
  pixels[index] = red;
  pixels[index + 1] = green;
  pixels[index + 2] = blue;
  pixels[index + 3] = alpha;
}

function paintHorizontalLine(pixels, width, y, left, right) {
  for (let x = left; x < right; x += 1) paintPixel(pixels, width, x, y);
}

test("findColorBounds locates controlled Pine anchor pixels", () => {
  const width = 80, height = 100;
  const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let y = 70; y <= 72; y += 1) for (let x = 20; x <= 28; x += 1) {
    const index = (y * width + x) * 4;
    pixels[index] = 255; pixels[index + 1] = 0; pixels[index + 2] = 254; pixels[index + 3] = 255;
  }
  const found = findColorBounds(pixels, width, height, [255, 0, 254], { left: 0, top: 0, right: width, bottom: height });
  assert.deepEqual(found, { minX: 20, maxX: 28, minY: 70, maxY: 72, count: 27, x: 24, y: 71 });
});

test("findHorizontalGridRows detects neutral TradingView grid rows through screenshot noise", () => {
  const width = 80, height = 200;
  const pixels = makePixels(width, height);
  for (const y of [20, 70, 120, 170]) paintHorizontalLine(pixels, width, y, 8, 72);
  for (let y = 0; y < height; y += 7) paintPixel(pixels, width, 16, y);

  const rows = findHorizontalGridRows(pixels, width, height, { left: 8, top: 0, right: 72, bottom: height });
  assert.deepEqual(rows, [20, 70, 120, 170]);
});

test("findHorizontalGridRows ignores a dotted neutral crosshair", () => {
  const width = 80, height = 200;
  const pixels = makePixels(width, height);
  for (const y of [20, 70, 120, 170]) paintHorizontalLine(pixels, width, y, 8, 72);
  for (let x = 8; x < 72; x += 16) {
    paintPixel(pixels, width, x, 95);
    paintPixel(pixels, width, x + 1, 95);
  }

  const rows = findHorizontalGridRows(pixels, width, height, { left: 8, top: 0, right: 72, bottom: height });
  assert.deepEqual(rows, [20, 70, 120, 170]);
});

test("dominantGridGap returns the rounded median usable grid gap", () => {
  assert.equal(dominantGridGap([20, 70, 120, 170]), 50);
  assert.equal(dominantGridGap([20, 70, 400]), 50);
});

test("priceIntervalFromPixels calibrates an interval from absolute TradingView anchors", () => {
  assert.equal(priceIntervalFromPixels(50, 120, 20, 23000, 24000), 500);
  assert.equal(priceIntervalFromPixels(50, { y: 120 }, { y: 20 }, 23000, 24000), 500);
});

test("priceIntervalFromPixels strictly rejects invalid raw calibration values", () => {
  assert.equal(priceIntervalFromPixels(50, null, 20, 23000, 24000), null, "null lower anchor");
  assert.equal(priceIntervalFromPixels(50, 120, { y: null }, 23000, 24000), null, "null upper anchor y");
  assert.equal(priceIntervalFromPixels(50, 120, 20, null, 24000), null, "null lower price");
  assert.equal(priceIntervalFromPixels(50, 120, 20, 23000, null), null, "null upper price");
  assert.equal(priceIntervalFromPixels(true, 120, 20, 23000, 24000), null, "boolean gap");
  assert.equal(priceIntervalFromPixels(50, " ", 20, 23000, 24000), null, "blank anchor");
  assert.equal(priceIntervalFromPixels(50, undefined, 20, 23000, 24000), null, "undefined anchor");
  assert.equal(priceIntervalFromPixels(50, 120, {}, 23000, 24000), null, "object without y");
  assert.equal(priceIntervalFromPixels(50, 120, 20, [], 24000), null, "array price");
});

test("pairAxisPricesWithRows produces absolute TradingView price and pixel references", () => {
  const paired = pairAxisPricesWithRows(["23,000", 24000, 22500, 23500], [20, 70, 120, 170]);
  assert.deepEqual(paired, [
    { price: 24000, y: 20 },
    { price: 23500, y: 70 },
    { price: 23000, y: 120 },
    { price: 22500, y: 170 }
  ]);
  const toY = priceToY(paired[3], paired[0], paired[3].price, paired[0].price);
  assert.equal(toY(23250), 95);
});

test("pairAxisPricesWithRows rejects missing, duplicate, nonfinite, and nonlinear axis data", () => {
  assert.equal(pairAxisPricesWithRows([24000, 23500, 23000], [20, 70]), null, "missing label");
  assert.equal(pairAxisPricesWithRows([24000, 23500, 23500], [20, 70, 120]), null, "duplicate price");
  assert.equal(pairAxisPricesWithRows([24000, "bad", 23000], [20, 70, 120]), null, "nonfinite price");
  assert.equal(pairAxisPricesWithRows([24000, 23500, 23000], [20, 70, 140]), null, "nonlinear mapping");
});

test("pairAxisPricesWithRows strictly rejects invalid raw prices and rows", () => {
  assert.equal(pairAxisPricesWithRows([24000, null], [20, 70]), null, "null price");
  assert.equal(pairAxisPricesWithRows([24000, false], [20, 70]), null, "boolean price");
  assert.equal(pairAxisPricesWithRows([24000, 23500], [20, null]), null, "null row");
  assert.equal(pairAxisPricesWithRows([24000, 23500], [20, " "]), null, "blank row");
  assert.equal(pairAxisPricesWithRows([24000, 23500], [20, true]), null, "boolean row");
  assert.equal(pairAxisPricesWithRows([24000, undefined], [20, 70]), null, "undefined price");
  assert.equal(pairAxisPricesWithRows([24000, 23500], [20, {}]), null, "object row");
});

test("priceToY maps five strikes between Pine anchors", () => {
  const toY = priceToY({ y: 70 }, { y: 30 }, 23600, 24000);
  assert.equal(toY(23600), 70);
  assert.equal(toY(23800), 50);
  assert.equal(toY(24000), 30);
});

test("priceToY rejects reversed visual anchors", () => {
  assert.equal(priceToY({ y: 30 }, { y: 70 }, 23600, 24000), null);
});

test("spreadAroundAnchor separates compressed labels while preserving the ATM coordinate", () => {
  assert.deepEqual(
    spreadAroundAnchor([300, 310, 320, 330, 340], 2, 26),
    [268, 294, 320, 346, 372]
  );
});

test("spreadAroundAnchor leaves already separated labels at exact strike coordinates", () => {
  assert.deepEqual(
    spreadAroundAnchor([240, 280, 320, 360, 400], 2, 26),
    [240, 280, 320, 360, 400]
  );
});
