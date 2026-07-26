const test = require("node:test");
const assert = require("node:assert/strict");
const { findColorBounds, priceToY, spreadAroundAnchor } = require("./overlay-utils.js");

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
