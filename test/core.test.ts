import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("util/versionCompare", () => {
  it("orders calendar, classic, velocity and pre-release ids", async () => {
    const { compareVersions, sortVersionsDesc } = await import("../src/util/versionCompare.js");
    assert.ok(compareVersions("26.3", "26.2") > 0);
    assert.ok(compareVersions("26.1.2", "26.1") > 0);
    assert.ok(compareVersions("26.1", "1.21.11") > 0);
    assert.ok(compareVersions("4.3.1", "4.2.1") > 0);
    assert.ok(compareVersions("26.3-rc-3", "26.3") < 0, "pre-release sorts before release");
    assert.ok(compareVersions("9.10", "9.7.1") > 0);
    assert.deepEqual(sortVersionsDesc(["1.21.11", "26.3", "26.1.2", "26.3"]), [
      "26.3",
      "26.1.2",
      "1.21.11",
    ]);
  });
});

describe("javadoc/indexParse", () => {
  it("extracts the array without eval, handling brackets inside strings", async () => {
    const { parseJsIndexArray } = await import("../src/javadoc/indexParse.js");
    const src =
      'typeSearchIndex = [{"p":"a.b","l":"Foo[]"},{"l":"Bar \\"q\\" ]"}];updateSearchResults();';
    const arr = parseJsIndexArray<{ p?: string; l: string }>(src, "typeSearchIndex");
    assert.equal(arr.length, 2);
    assert.equal(arr[0].l, "Foo[]");
    assert.equal(arr[1].l, 'Bar "q" ]');
    assert.throws(() => parseJsIndexArray("nothing here", "typeSearchIndex"));
  });
});

describe("cache / HttpStatusError", () => {
  it("treats 4xx as final and 5xx/408/429 as retryable", async () => {
    const { HttpStatusError } = await import("../src/cache.js");
    assert.equal(new HttpStatusError(404, "u").retryable, false);
    assert.equal(new HttpStatusError(403, "u").retryable, false);
    assert.equal(new HttpStatusError(429, "u").retryable, true);
    assert.equal(new HttpStatusError(408, "u").retryable, true);
    assert.equal(new HttpStatusError(503, "u").retryable, true);
  });
});
