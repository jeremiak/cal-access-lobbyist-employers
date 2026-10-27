import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseTsv } from "../src/tsv.js";

// Collect everything parseTsv yields into an array.
async function parse(lines, options) {
  const rows = [];
  for await (const row of parseTsv(lines, options)) rows.push(row);
  return rows;
}

describe("parseTsv", () => {
  test("turns each line after the header into an object keyed by column", async () => {
    assert.deepEqual(
      await parse([
        "FILING_ID\tAMEND_ID\tFORM_TYPE",
        "3039416\t0\tF635",
        "3112595\t1\tF635",
      ]),
      [
        { FILING_ID: "3039416", AMEND_ID: "0", FORM_TYPE: "F635" },
        { FILING_ID: "3112595", AMEND_ID: "1", FORM_TYPE: "F635" },
      ],
    );
  });

  test("keeps empty fields as empty strings", async () => {
    assert.deepEqual(
      await parse(["A\tB\tC", "1\t\t3"]),
      [{ A: "1", B: "", C: "3" }],
    );
  });

  test("yields nothing for an empty table or one with only a header", async () => {
    assert.deepEqual(await parse([]), []);
    assert.deepEqual(await parse(["A\tB\tC"]), []);
  });

  test("reads from an async iterable, like a stream of lines", async () => {
    async function* lines() {
      yield "A\tB";
      yield "1\t2";
    }
    assert.deepEqual(await parse(lines()), [{ A: "1", B: "2" }]);
  });

  describe("line breaks inside a field", () => {
    test("joins a row split across two lines", async () => {
      assert.deepEqual(
        await parse([
          "ID\tLBY_ACTVTY\tLOBBY_N_CB",
          "1\tLegislature, re: SB 7,",
          "SB 915\tX",
          "2\tNONE\t",
        ]),
        [
          { ID: "1", LBY_ACTVTY: "Legislature, re: SB 7,\nSB 915", LOBBY_N_CB: "X" },
          { ID: "2", LBY_ACTVTY: "NONE", LOBBY_N_CB: "" },
        ],
      );
    });

    test("joins a row split across more than two lines", async () => {
      assert.deepEqual(
        await parse(["A\tB\tC", "1\tone", "two", "three\t3"]),
        [{ A: "1", B: "one\ntwo\nthree", C: "3" }],
      );
    });

    test("yields a broken row that's still unfinished at the end of the table", async () => {
      assert.deepEqual(
        await parse(["A\tB\tC", "1\t2\t3", "4\tfive"]),
        [
          { A: "1", B: "2", C: "3" },
          { A: "4", B: "five", C: undefined },
        ],
      );
    });

    test("doesn't join a short row onto a following complete row", async () => {
      // If the next line is a whole row by itself, the short line was just a
      // short row, not the start of a broken one.
      assert.deepEqual(
        await parse(["A\tB\tC", "1\t2", "3\t4\t5"]),
        [
          { A: "1", B: "2", C: undefined },
          { A: "3", B: "4", C: "5" },
        ],
      );
    });
  });

  describe("tabs inside a field", () => {
    test("joins the extra pieces back into the text column with a space", async () => {
      assert.deepEqual(
        await parse(
          [
            "ID\tLBY_ACTVTY\tLOBBY_N_CB",
            "1\tLEGISLATURE: SB 867.\tCA NATURAL RESOURCES AGENCY: 30x30\tX",
          ],
          { textColumn: "LBY_ACTVTY" },
        ),
        [{
          ID: "1",
          LBY_ACTVTY: "LEGISLATURE: SB 867. CA NATURAL RESOURCES AGENCY: 30x30",
          LOBBY_N_CB: "X",
        }],
      );
    });

    test("handles several tabs in the same field", async () => {
      assert.deepEqual(
        await parse(["A\tB\tC", "1\tone\ttwo\tthree\t3"], { textColumn: "B" }),
        [{ A: "1", B: "one two three", C: "3" }],
      );
    });

    test("works when the text column is the last column", async () => {
      assert.deepEqual(
        await parse(
          ["FILING_ID\tREF_NO\tTEXT4000", "3180792\tA\tAB 35\tAB 380"],
          { textColumn: "TEXT4000" },
        ),
        [{ FILING_ID: "3180792", REF_NO: "A", TEXT4000: "AB 35 AB 380" }],
      );
    });

    test("ignores a text column that isn't in the header", async () => {
      assert.deepEqual(
        await parse(["A\tB", "1\t2"], { textColumn: "MISSING" }),
        [{ A: "1", B: "2" }],
      );
    });
  });

  describe("line breaks and tabs in the same field", () => {
    test("joins the lines, then joins the extra pieces into the text column", async () => {
      // Column B is "one<tab>two<line break>three".
      assert.deepEqual(
        await parse(
          ["A\tB\tC\tD", "1\tone\ttwo", "three\t3\t4"],
          { textColumn: "B" },
        ),
        [{ A: "1", B: "one two\nthree", C: "3", D: "4" }],
      );
    });

    test("treats a following line with a full row's worth of columns as a new row", async () => {
      // Column B is meant to be "one<line break>two<tab>three", but the line
      // after the break has as many columns as a whole row, so it looks just
      // like the start of the next row. There's no way to tell them apart,
      // and in the real export a line like that almost always is a new row,
      // so that's how it's read.
      assert.deepEqual(
        await parse(
          ["A\tB\tC", "1\tone", "two\tthree\t3"],
          { textColumn: "B" },
        ),
        [
          { A: "1", B: "one", C: undefined },
          { A: "two", B: "three", C: "3" },
        ],
      );
    });
  });
});
