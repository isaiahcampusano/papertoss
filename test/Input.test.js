import test from "node:test";
import assert from "node:assert/strict";

import { swipeToLaunch } from "../src/ui/input.js";

test("an upward flick becomes a forward launch with lateral aim", () => {
  const launch = swipeToLaunch({ startX: 100, startY: 220, endX: 130, endY: 120 });

  assert.ok(launch);
  assert.equal(launch.angleRad, Math.PI / 4);
  assert.ok(launch.power > 3 && launch.power < 4);
  assert.ok(launch.lateralSpeed > 0);
});

test("longer swipes create more power", () => {
  const short = swipeToLaunch({ startX: 100, startY: 220, endX: 100, endY: 160 });
  const long = swipeToLaunch({ startX: 100, startY: 220, endX: 100, endY: 40 });

  assert.ok(long.power > short.power);
});

test("tiny or downward swipes are ignored", () => {
  assert.equal(swipeToLaunch({ startX: 0, startY: 0, endX: 5, endY: -5 }), null);
  assert.equal(swipeToLaunch({ startX: 100, startY: 0, endX: 130, endY: 100 }), null);
});
