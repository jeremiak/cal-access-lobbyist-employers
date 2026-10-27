import _ from "lodash";

// When the list of things lobbied on is too long for the cover page, filers
// put it in an attachment (a "memo" in TEXT_MEMO_CD) and write a pointer to it
// on the cover instead: "SEE ATTACHMENT A", "See attachment 'Part 1'", "See
// memo", "SEE ATTACHED.", and so on. Spot those short pointers. Longer text
// that mentions an attachment in passing is a real description, so leave it.
export function isAttachmentPointer(text) {
  return text.length <= 100 &&
    /\b(see|refer|attach\w*|memo\w*)\b/i.test(text) &&
    /\b(attach\w*|memo\w*|notes?|text)\b/i.test(text);
}

// Attachments are labeled with a reference like "A", "1", "Part 1", "#1" or
// "MEMO 1". Reduce one to its essential part ("A", "1", "PART1") so the
// cover's "SEE ATTACHMENT 'A'." matches an attachment labeled "A", and an
// attachment labeled "A CONT" counts as part of "A".
//
// Longer references, like "7774" or "MEMO-424202533522", are generated
// numbers tying an attachment to some other part of the report. Those are
// kept whole, since they still mean the attachment has a reference.
export function normalizeReference(reference) {
  const cleaned = reference
    .toUpperCase()
    .replace(/['"#.:]/g, "")
    .replace(/^\s*(ATTACH\w*|MEMO\b)\s*/, "")
    .trim();
  const match = cleaned.match(/^(PART\s*\w+|[A-Z0-9]{1,3})\b/);
  if (match) return match[1].replace(/\s+/g, "");
  return cleaned.replace(/\s+/g, "") || null;
}

// The attachment references a pointer names, in order. "SEE ATTACHMENT 'A'
// AND 'B'." gives ["A", "B"]. "SEE ATTACHED." names none.
export function pointerReferences(text) {
  const match = text.match(/\b(attach\w*|memo\w*)(\s+reference)?\s*:?\s*(.*)$/i);
  if (!match) return [];
  return match[3]
    .split(/,|&|\band\b/i)
    .map(normalizeReference)
    .filter(Boolean);
}

// Pick the attachment(s) a pointer refers to, or return null if we can't tell.
//
// `cover` is { amendId, lobbiedOn }, and each attachment is
// { amendId, lineItem, reference, text } with `reference` already run
// through normalizeReference.
export function resolveAttachmentPointer(cover, attachments) {
  // Like the cover page, attachments are refiled with each amendment. Use the
  // ones from the cover's amendment, or from the latest earlier amendment
  // that had any, since an amendment sometimes leaves them off.
  const amendIds = attachments
    .map((attachment) => attachment.amendId)
    .filter((amendId) => amendId <= +cover.amendId);
  if (amendIds.length === 0) return null;
  const amendId = Math.max(...amendIds);
  const candidates = _.sortBy(
    attachments.filter((attachment) =>
      attachment.amendId === amendId && attachment.text
    ),
    "lineItem",
  );

  // If the pointer names attachments, use exactly those, in the order named.
  const references = pointerReferences(cover.lobbiedOn);
  const named = references.flatMap((reference) =>
    candidates.filter((attachment) => attachment.reference === reference)
  );
  if (named.length > 0) {
    return named.map((attachment) => attachment.text).join(" ");
  }

  // Otherwise it has to be the only attachment. Some filers attach the same
  // text twice, so ignore exact duplicates. Attachments with a reference
  // number usually belong to something else on the report (like the list of
  // people who attended an event), so if that leaves more than one, try just
  // the ones without a reference.
  let unique = _.uniqBy(candidates, "text");
  if (unique.length > 1) {
    unique = unique.filter((attachment) => !attachment.reference);
  }
  return unique.length === 1 ? unique[0].text : null;
}

// Swap "SEE ATTACHMENT A" and the like for the text of the attachment. This
// changes the covers in place. It returns how many were replaced, and which
// pointers couldn't be resolved as "<employer id> (filing <filing id>)".
export function replaceAttachmentPointers(
  coversByEmployer,
  attachmentsByFilingId,
) {
  let replaced = 0;
  const unresolved = [];

  for (const [employerId, covers] of coversByEmployer) {
    for (const cover of covers) {
      const attachments = attachmentsByFilingId.get(cover.filingId);
      if (!attachments) continue;

      const text = resolveAttachmentPointer(cover, attachments);
      if (text) {
        cover.lobbiedOn = text;
        replaced++;
      } else {
        unresolved.push(`${employerId} (filing ${cover.filingId})`);
      }
    }
  }

  return { replaced, unresolved };
}
