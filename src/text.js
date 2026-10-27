// Free text in the export has stray tabs, line breaks, and runs of spaces,
// and some of it is stored HTML escaped (like "&amp;"). Clean it up so it
// reads the way it does on the website.
export function cleanText(text) {
  return (text ?? "")
    .replaceAll("\u0000", "")
    .replace(/&(amp|lt|gt|quot|#39);/g, (_match, entity) => ({
      amp: "&",
      lt: "<",
      gt: ">",
      quot: '"',
      "#39": "'",
    })[entity])
    .replace(/\s+/g, " ")
    .trim();
}

// Names are split into last name (or organization name) and first name. Each
// part is cleaned before they're joined, since the export often pads them
// with spaces and "Farabee , David" would look wrong.
export function fullName(last, first) {
  const cleanLast = cleanText(last);
  const cleanFirst = cleanText(first);
  return cleanFirst ? `${cleanLast}, ${cleanFirst}` : cleanLast;
}
