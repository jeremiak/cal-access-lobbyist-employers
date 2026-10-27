// Read what we need out of each table in the export. Each function takes the
// opened export (see openExport in export-zip.js) and streams through one
// table, keeping only the rows that matter.

import { isAttachmentPointer, normalizeReference } from "./attachments.js";
import { readTable } from "./export-zip.js";
import { sessionQuarter } from "./quarters.js";
import { cleanText, fullName } from "./text.js";

// FILER_TO_FILER_TYPE_CD codes for the two kinds of filer the website lists
// as "lobbyist employers": 1 is a client of a lobbying firm, 2 is an employer
// with its own in-house lobbyists.
const EMPLOYER_FILER_TYPES = new Set(["1", "2"]);
// Y is active and T is terminated partway through the session. Both show up
// on the website. Filers marked N or S for the session mostly don't.
const EMPLOYER_STATUSES = new Set(["Y", "T"]);

// Form 635 is the quarterly report a lobbyist employer files.
const EMPLOYER_REPORT_FORM = "F635";
// On a Form 635, summary line "ABCD" is the total of lines A through D: all
// the payments made to influence legislative or administrative action that
// quarter. Line "E" is payments in connection with Public Utilities
// Commission proceedings. These are the "General Lobbying" and "PUC Lobbying"
// columns on the website.
const GENERAL_LOBBYING_LINE = "ABCD";
const PUC_LOBBYING_LINE = "E";

// Every filer the website lists as a lobbyist employer for the session.
export async function getEmployerIds(exportZip, session) {
  const ids = new Set();
  for await (const row of readTable(exportZip, "FILER_TO_FILER_TYPE_CD")) {
    if (
      +row.SESSION_ID === session &&
      EMPLOYER_FILER_TYPES.has(row.FILER_TYPE) &&
      EMPLOYER_STATUSES.has(row.ACTIVE)
    ) {
      ids.add(row.FILER_ID);
    }
  }
  return ids;
}

// Every Form 635 filed by one of the employers, mapped to who filed it.
export async function getReportFilers(exportZip, employerIds) {
  const filerByFilingId = new Map();
  for await (const row of readTable(exportZip, "FILER_FILINGS_CD")) {
    if (row.FORM_ID === EMPLOYER_REPORT_FORM && employerIds.has(row.FILER_ID)) {
      filerByFilingId.set(row.FILING_ID, row.FILER_ID);
    }
  }
  return filerByFilingId;
}

// The cover page of each employer's quarterly reports for the session,
// organized by employer.
export async function getReportCovers(exportZip, filerByFilingId, session) {
  // A report can be amended, and each amendment is a new row with a higher
  // AMEND_ID. Only the latest amendment counts.
  const latestCoverByFilingId = new Map();

  for await (
    const row of readTable(exportZip, "CVR_LOBBY_DISCLOSURE_CD", {
      textColumn: "LBY_ACTVTY",
    })
  ) {
    if (row.FORM_TYPE !== EMPLOYER_REPORT_FORM) continue;
    if (!filerByFilingId.has(row.FILING_ID)) continue;

    const existing = latestCoverByFilingId.get(row.FILING_ID);
    if (!existing || +row.AMEND_ID > +existing.amendId) {
      latestCoverByFilingId.set(row.FILING_ID, {
        filingId: row.FILING_ID,
        amendId: row.AMEND_ID,
        // Which quarter a report covers comes from its own "from" date.
        // FILER_FILINGS_CD also assigns each filing a period, but some
        // filers typo the dates on their reports and the period is wrong
        // more often than this is.
        quarter: sessionQuarter(row.FROM_DATE, session),
        name: fullName(row.FILER_NAML, row.FILER_NAMF),
        lobbiedOn: cleanText(row.LBY_ACTVTY),
      });
    }
  }

  // employer id -> covers
  const coversByEmployer = new Map();

  for (const cover of latestCoverByFilingId.values()) {
    // Skip reports for other sessions.
    if (cover.quarter === null || cover.quarter < 0 || cover.quarter > 7) {
      continue;
    }

    // Occasionally an employer has two separate reports that start in the
    // same quarter, usually because one has a typo in its dates. The website
    // lists both as their own rows under that quarter, so we keep both too.
    const employerId = filerByFilingId.get(cover.filingId);
    if (!coversByEmployer.has(employerId)) coversByEmployer.set(employerId, []);
    coversByEmployer.get(employerId).push(cover);
  }

  return coversByEmployer;
}

// Every cover-page attachment for the reports whose "lobbied on" description
// is just a pointer, keyed by filing id.
export async function getCoverAttachments(exportZip, coversByEmployer) {
  const attachmentsByFilingId = new Map();
  for (const covers of coversByEmployer.values()) {
    for (const cover of covers) {
      if (isAttachmentPointer(cover.lobbiedOn)) {
        attachmentsByFilingId.set(cover.filingId, []);
      }
    }
  }

  for await (
    const row of readTable(exportZip, "TEXT_MEMO_CD", { textColumn: "TEXT4000" })
  ) {
    // Attachments to other parts of the report, like the list of payments
    // to lobbying firms, have their own form types (F635P3B, S640, etc.).
    if (row.FORM_TYPE !== EMPLOYER_REPORT_FORM) continue;
    const attachments = attachmentsByFilingId.get(row.FILING_ID);
    if (!attachments) continue;

    attachments.push({
      amendId: +row.AMEND_ID,
      lineItem: +row.LINE_ITEM,
      reference: normalizeReference(row.REF_NO ?? ""),
      text: cleanText(row.TEXT4000),
    });
  }

  return attachmentsByFilingId;
}

// The summary totals for each report we're using, keyed by
// "<filing id>|<amendment id>".
export async function getReportTotals(exportZip, coversByEmployer) {
  const totals = new Map();
  for (const covers of coversByEmployer.values()) {
    for (const cover of covers) {
      totals.set(`${cover.filingId}|${cover.amendId}`, {
        generalLobbying: 0,
        pucLobbying: 0,
      });
    }
  }

  for await (const row of readTable(exportZip, "SMRY_CD")) {
    if (row.FORM_TYPE !== EMPLOYER_REPORT_FORM) continue;
    const total = totals.get(`${row.FILING_ID}|${row.AMEND_ID}`);
    if (!total) continue;

    // A blank amount means nothing was reported, which the website shows as
    // 0, so `+""` giving 0 is what we want here.
    if (row.LINE_ITEM === GENERAL_LOBBYING_LINE) {
      total.generalLobbying = +row.AMOUNT_A || 0;
    } else if (row.LINE_ITEM === PUC_LOBBYING_LINE) {
      total.pucLobbying = +row.AMOUNT_A || 0;
    }
  }

  return totals;
}

// Every distinct name each employer has used, in the order they appear.
export async function getNameVariants(exportZip, employerIds) {
  const namesByEmployer = new Map();
  for await (const row of readTable(exportZip, "FILERNAME_CD")) {
    if (!employerIds.has(row.FILER_ID)) continue;
    const name = fullName(row.NAML, row.NAMF);
    if (!name) continue;
    if (!namesByEmployer.has(row.FILER_ID)) {
      namesByEmployer.set(row.FILER_ID, []);
    }
    const names = namesByEmployer.get(row.FILER_ID);
    if (!names.includes(name)) names.push(name);
  }
  return namesByEmployer;
}
