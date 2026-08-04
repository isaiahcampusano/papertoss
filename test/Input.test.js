import test from "node:test";
import assert from "node:assert/strict";

import { swipeToLaunch } from "../src/ui/input.js";

test("a swipe up and right becomes a launch", () => {
  const launch = swipeToLaunch({ startX: 40, startY: 200, endX: 120, endY: 120 });

  assert.ok(launch);
  assert.ok(launch.angleRad > 0.7 && launch.angleRad < 0.9);
  assert.ok(launch.power > 3 && launch.power < 4);
});

test("longer swipes create more power", () => {
  const short = swipeToLaunch({ startX: 0, startY: 100, endX: 60, endY: 50 });
  const long = swipeToLaunch({ startX: 0, startY: 100, endX: 160, endY: 0 });

  assert.ok(long.power > short.power);
});

test("tiny or backward swipes are ignored", () => {
  assert.equal(swipeToLaunch({ startX: 0, startY: 0, endX: 5, endY: -5 }), null);
  assert.equal(swipeToLaunch({ startX: 100, startY: 0, endX: 50, endY: -100 }), null);
});
