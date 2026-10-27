import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { pickName } from "../src/employers.js";

describe("pickName", () => {
  test("uses the name variant that matches the latest report's name", () => {
    // Real names for filer 1143746, which has used both.
    assert.equal(
      pickName(["3M", "3M COMPANY"], { name: "3M COMPANY" }),
      "3M COMPANY",
    );
  });

  test("ignores capitalization, spacing and punctuation when matching", () => {
    assert.equal(
      pickName(
        ["ALLIANCE TO PREVENT LEGIONNAIRES' DISEASE, INC."],
        { name: "Alliance to Prevent Legionnaires Disease Inc" },
      ),
      "ALLIANCE TO PREVENT LEGIONNAIRES' DISEASE, INC.",
    );
  });

  test("uses the first matching variant when several match", () => {
    assert.equal(
      pickName(["A.O. SMITH CORPORATION", "A. O. SMITH CORPORATION"], {
        name: "AO Smith Corporation",
      }),
      "A.O. SMITH CORPORATION",
    );
  });

  test("falls back to the latest report's name, uppercased, when no variant matches", () => {
    assert.equal(
      pickName(["ALAMEDA; COUNTY OF"], { name: "County of Alameda" }),
      "COUNTY OF ALAMEDA",
    );
  });

  test("uses the report's name when there are no variants", () => {
    assert.equal(pickName(undefined, { name: "Earnin" }), "EARNIN");
    assert.equal(pickName([], { name: "Earnin" }), "EARNIN");
  });

  test("uses the first variant when there's no report", () => {
    // An employer can be registered for the session without having filed a
    // quarterly report yet.
    assert.equal(
      pickName(["7-ELEVEN, INC.", "7-11", "SOUTHLAND CORPORATION, THE"]),
      "7-ELEVEN, INC.",
    );
  });

  test("uses the first variant when the report has no name", () => {
    assert.equal(pickName(["ADOBE", "ADOBE SYSTEMS"], { name: "" }), "ADOBE");
  });

  test("returns an empty string when there's nothing to go on", () => {
    assert.equal(pickName(), "");
    assert.equal(pickName([], undefined), "");
  });
});
