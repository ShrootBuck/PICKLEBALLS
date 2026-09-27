import { expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";

test("container health checks pass the login gate without exposing other APIs", () => {
  const health = proxy(new NextRequest("https://pickle-balls.com/api/health"));
  expect(health.headers.get("x-middleware-next")).toBe("1");
  for (const path of ["/api/media", "/api/health/private"]) {
    expect(
      proxy(new NextRequest(`https://pickle-balls.com${path}`)).status,
    ).toBe(401);
  }
});
