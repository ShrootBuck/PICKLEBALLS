import { afterEach, expect, test } from "bun:test";
import { hasSameOrigin } from "../lib/request-origin";

const original = { ...process.env };
afterEach(() => {
  for (const key of [
    "PB_SELF_HOSTED",
    "NEXT_PUBLIC_APP_URL",
    "BETTER_AUTH_URL",
    "APP_ALLOWED_ORIGINS",
  ]) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
});
function request(headers: Record<string, string>) {
  return new Request("http://0.0.0.0:3000/api/commitments/task/proof", {
    headers,
  });
}
test("public HTTPS mutations work behind the private HTTP reverse proxy", () => {
  process.env.PB_SELF_HOSTED = "true";
  process.env.NEXT_PUBLIC_APP_URL = "https://pickle-balls.com";
  process.env.APP_ALLOWED_ORIGINS =
    "https://www.pickle-balls.com, https://home.pickle-balls.com";
  for (const origin of [
    "https://pickle-balls.com",
    "https://www.pickle-balls.com",
    "https://home.pickle-balls.com",
  ]) {
    expect(hasSameOrigin(request({ origin }))).toBe(true);
    expect(hasSameOrigin(request({ referer: `${origin}/today` }))).toBe(true);
  }
});
test("cross-site, missing, null and forged forwarding origins stay rejected", () => {
  process.env.PB_SELF_HOSTED = "true";
  process.env.NEXT_PUBLIC_APP_URL = "https://pickle-balls.com";
  delete process.env.BETTER_AUTH_URL;
  delete process.env.APP_ALLOWED_ORIGINS;
  for (const origin of [
    "null",
    "https://evil.test",
    "https://pickle-balls.com.evil.test",
    "http://pickle-balls.com",
    "http://0.0.0.0:3000",
  ]) {
    expect(
      hasSameOrigin(
        request({
          origin,
          "x-forwarded-host": "evil.test",
          "x-forwarded-proto": "https",
          referer: "https://pickle-balls.com/today",
        }),
      ),
    ).toBe(false);
  }
  expect(hasSameOrigin(request({}))).toBe(false);
  expect(hasSameOrigin(request({ referer: "garbage" }))).toBe(false);
});
test("local development retains same-origin validation", () => {
  delete process.env.PB_SELF_HOSTED;
  expect(hasSameOrigin(request({ origin: "http://0.0.0.0:3000" }))).toBe(true);
  expect(hasSameOrigin(request({ origin: "https://evil.test" }))).toBe(false);
});
