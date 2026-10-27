import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { cleanText, fullName } from "../src/text.js";

describe("cleanText", () => {
  test("leaves ordinary text alone", () => {
    assert.equal(
      cleanText("Lobbied the legislature regarding SB 351."),
      "Lobbied the legislature regarding SB 351.",
    );
  });

  test("trims whitespace from both ends", () => {
    // Real cover pages pad the description with trailing spaces.
    assert.equal(cleanText("SB 675    "), "SB 675");
    assert.equal(cleanText("  NONE"), "NONE");
  });

  test("collapses runs of spaces, tabs and line breaks into one space", () => {
    assert.equal(cleanText("AB 7  AB 26   AB 52"), "AB 7 AB 26 AB 52");
    assert.equal(
      cleanText("LEGISLATURE: SB 867.\tCA NATURAL RESOURCES AGENCY: 30x30"),
      "LEGISLATURE: SB 867. CA NATURAL RESOURCES AGENCY: 30x30",
    );
    assert.equal(cleanText("Legislature, re:\r\nbudget"), "Legislature, re: budget");
  });

  test("removes null characters", () => {
    assert.equal(cleanText("CHP b\u0000 Invoicing"), "CHP b Invoicing");
  });

  test("decodes HTML entities", () => {
    assert.equal(
      cleanText("Budget: GGRF/C&amp;T, INDIGO"),
      "Budget: GGRF/C&T, INDIGO",
    );
    assert.equal(cleanText("&lt;none&gt;"), "<none>");
    assert.equal(cleanText("&quot;Part 1&quot;"), '"Part 1"');
    assert.equal(cleanText("Governor&#39;s Office"), "Governor's Office");
  });

  test("decodes each entity only once", () => {
    // "&amp;lt;" is an escaped "&lt;", not an escaped "<".
    assert.equal(cleanText("&amp;lt;"), "&lt;");
  });

  test("leaves entities it doesn't know about alone", () => {
    assert.equal(cleanText("AB&nbsp;1"), "AB&nbsp;1");
  });

  test("returns an empty string for missing text", () => {
    assert.equal(cleanText(undefined), "");
    assert.equal(cleanText(null), "");
    assert.equal(cleanText(""), "");
    assert.equal(cleanText("   "), "");
  });
});

describe("fullName", () => {
  test("uses just the last name when there's no first name", () => {
    // Organizations have their whole name in the last name field.
    assert.equal(fullName("1-800 CONTACTS"), "1-800 CONTACTS");
    assert.equal(fullName("1-800 CONTACTS", ""), "1-800 CONTACTS");
  });

  test("joins the last and first name with a comma", () => {
    assert.equal(fullName("Dinno", "Rachel"), "Dinno, Rachel");
  });

  test("cleans up the name", () => {
    assert.equal(fullName("  Farabee ", "David  R. "), "Farabee, David R.");
    assert.equal(fullName("AEG &amp; AFFILIATED ENTITIES"), "AEG & AFFILIATED ENTITIES");
  });

  test("returns an empty string when there's no name", () => {
    assert.equal(fullName(undefined, undefined), "");
    assert.equal(fullName("", ""), "");
  });
});
