import yauzl from "yauzl";
import { createInterface } from "readline";
import { promisify } from "util";
import { parseTsv } from "./tsv.js";

// Every table lives in this folder inside the zip.
const TABLE_DIRECTORY = "CalAccess/DATA";

// yauzl's API uses callbacks, so wrap the two calls we need in promises.
const openZip = promisify(yauzl.open);

// Open the zip and index its files by name, so tables can be read in whatever
// order we need without unzipping anything to disk.
export async function openExport(path) {
  const zip = await openZip(path, { lazyEntries: true, autoClose: false });
  const entries = new Map();

  await new Promise((resolve, reject) => {
    zip.on("entry", (entry) => {
      entries.set(entry.fileName, entry);
      zip.readEntry();
    });
    zip.on("end", resolve);
    zip.on("error", reject);
    zip.readEntry();
  });

  const openReadStream = promisify(zip.openReadStream.bind(zip));

  return {
    close: () => zip.close(),
    async openTable(table) {
      const entry = entries.get(`${TABLE_DIRECTORY}/${table}.TSV`);
      if (!entry) throw new Error(`The export doesn't have a ${table} table`);
      return openReadStream(entry);
    },
  };
}

// Read a table one row at a time. The tables are hundreds of megabytes, so
// they're streamed rather than loaded into memory all at once. `exportZip` is
// anything with an `openTable(table)` that returns a readable stream, which
// is what `openExport` gives you. See parseTsv for `options`.
export async function* readTable(exportZip, table, options) {
  console.log(`Reading ${table}`);
  const lines = createInterface({
    input: await exportZip.openTable(table),
    crlfDelay: Infinity,
  });
  yield* parseTsv(lines, options);
}
