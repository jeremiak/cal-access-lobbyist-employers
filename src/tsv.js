// Parse lines of a Cal-Access table into rows, yielding each row as an object
// keyed by column name. The first line is the header. `lines` can be any
// iterable or async iterable of strings, so this works on a stream from the
// export zip or on a plain array of lines in a test.
//
// The tables are tab-separated with no quoting, which goes wrong when someone
// typed a tab or a line break into a free text field:
//
// - A line break splits one row across two (or more) lines. We spot this
//   because the first line has too few columns, and join the lines back
//   together.
// - A tab splits one field into several, so the row has too many columns.
//   If the caller tells us which column holds free text (`textColumn`), the
//   extra pieces are joined back into that column with a space.
export async function* parseTsv(lines, { textColumn } = {}) {
  let header;
  let textColumnIndex;
  let pending = null;

  const toRow = (fields) => {
    const extra = fields.length - header.length;
    if (extra > 0 && textColumnIndex >= 0) {
      const text = fields
        .splice(textColumnIndex, extra + 1)
        .join(" ");
      fields.splice(textColumnIndex, 0, text);
    }
    return Object.fromEntries(header.map((column, i) => [column, fields[i]]));
  };

  for await (const line of lines) {
    if (!header) {
      header = line.split("\t");
      textColumnIndex = textColumn ? header.indexOf(textColumn) : -1;
      continue;
    }

    // A line that's a complete row by itself starts a new row, so whatever
    // was pending was just a short row and not the start of a broken one.
    if (pending !== null && line.split("\t").length >= header.length) {
      yield toRow(pending.split("\t"));
      pending = null;
    }

    const row = pending === null ? line : `${pending}\n${line}`;
    const fields = row.split("\t");

    // Too few columns, so this row probably continues on the next line.
    if (fields.length < header.length) {
      pending = row;
      continue;
    }

    pending = null;
    yield toRow(fields);
  }

  if (pending !== null) yield toRow(pending.split("\t"));
}
