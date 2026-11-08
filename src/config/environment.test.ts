import { describe, expect, test } from "bun:test";
import {
  getStoryblokRequestsPerSecond,
  getStoryblokRegion,
  getStoryblokToken,
} from "./environment.ts";

test("accepts a region override and rejects invalid values", () => {
  expect(getStoryblokRegion({})).toBeUndefined();
  expect(getStoryblokRegion({ STORYBLOK_REGION: " us " })).toBe("us");
  expect(() => getStoryblokRegion({ STORYBLOK_REGION: "unknown" })).toThrow(
    "STORYBLOK_REGION",
  );
});

describe("getStoryblokToken", () => {
  test("returns a trimmed token", () => {
    expect(getStoryblokToken({ STORYBLOK_TOKEN: " token " })).toBe("token");
  });

  test("rejects a missing token", () => {
    expect(() => getStoryblokToken({})).toThrow("STORYBLOK_TOKEN is required");
  });
});

describe("getStoryblokRequestsPerSecond", () => {
  test("defaults to 6 and accepts an explicit rate", () => {
    expect(getStoryblokRequestsPerSecond({})).toBe(6);
    expect(
      getStoryblokRequestsPerSecond({ STORYBLOK_REQUESTS_PER_SECOND: "3" }),
    ).toBe(3);
  });
  test("rejects invalid rates", () => {
    expect(() =>
      getStoryblokRequestsPerSecond({ STORYBLOK_REQUESTS_PER_SECOND: "0" }),
    ).toThrow("between 1 and 100");
  });
});
