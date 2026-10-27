// Build lobbyist-employers-financial-activity-<session>.json from the
// Secretary of State's daily bulk export of the whole Cal-Access database,
// instead of scraping the Cal-Access website (see scrape.mjs).
//
// Usage:
//   node src/index.js                          # download the export, 2025 session
//   node src/index.js --session 2023           # a different legislative session
//   node src/index.js --zip ./dbwebexport.zip  # use an export already on disk
//   node src/index.js --out ./test.json        # write somewhere else
//
// The output has the same shape as the scraped file:
//   [{ id, name, quarters: [{ quarter, session, generalLobbying, pucLobbying, lobbiedOn }] }]
//
// Everything comes from these tables in the export (see tables.js):
//   FILER_TO_FILER_TYPE_CD    which filers were lobbyist employers in the session
//   FILERNAME_CD              the names those filers have used
//   FILER_FILINGS_CD          which filings belong to which filer
//   CVR_LOBBY_DISCLOSURE_CD   the cover page of each Form 635 (the quarterly
//                             lobbyist employer report): the dates it covers
//                             and the "lobbied on" description
//   TEXT_MEMO_CD              attachments to each Form 635, for when the
//                             "lobbied on" description on the cover page just
//                             says something like "SEE ATTACHMENT A"
//   SMRY_CD                   the summary totals of each Form 635

import { rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { parseArgs } from "util";
import { replaceAttachmentPointers } from "./attachments.js";
import { downloadExport } from "./download.js";
import { buildEmployers } from "./employers.js";
import { openExport } from "./export-zip.js";
import { sessionName } from "./quarters.js";
import {
  getCoverAttachments,
  getEmployerIds,
  getNameVariants,
  getReportCovers,
  getReportFilers,
  getReportTotals,
} from "./tables.js";

const { values: args } = parseArgs({
  options: {
    session: { type: "string", default: "2025" },
    zip: { type: "string" },
    out: { type: "string" },
  },
});

const session = +args.session;
const fileName = args.out ??
  `./lobbyist-employers-financial-activity-${session}.json`;

let zipPath = args.zip;
const downloaded = !zipPath;

if (downloaded) {
  zipPath = join(tmpdir(), `cal-access-dbwebexport-${Date.now()}.zip`);
  await downloadExport(zipPath);
}

const exportZip = await openExport(zipPath);

console.log(
  `Extracting lobbyist employers for the ${sessionName(session)} session`,
);
const employerIds = await getEmployerIds(exportZip, session);
console.log(`Found ${employerIds.size} lobbyist employers`);

if (employerIds.size === 0) {
  console.log(
    "Found zero lobbyist employers - something messed up and not going to save anything",
  );
  process.exit(1);
}

const filerByFilingId = await getReportFilers(exportZip, employerIds);
const coversByEmployer = await getReportCovers(
  exportZip,
  filerByFilingId,
  session,
);
const attachmentsByFilingId = await getCoverAttachments(
  exportZip,
  coversByEmployer,
);

const { replaced, unresolved } = replaceAttachmentPointers(
  coversByEmployer,
  attachmentsByFilingId,
);
console.log(`Replaced ${replaced} "see attachment" descriptions`);
// These keep their pointer text. Either the attachment isn't in the export,
// or there are several and nothing says which one is meant.
if (unresolved.length > 0) {
  console.log(
    `Couldn't find the attachment for ${unresolved.length}: ${unresolved.join(", ")}`,
  );
}

const totals = await getReportTotals(exportZip, coversByEmployer);
const namesByEmployer = await getNameVariants(exportZip, employerIds);

exportZip.close();

// Don't leave a 1.6 GB file sitting in the temp directory. If the export was
// passed in with --zip, it's the caller's file, so leave it alone.
if (downloaded) await rm(zipPath);

const employers = buildEmployers({
  session,
  employerIds,
  coversByEmployer,
  totals,
  namesByEmployer,
});

console.log(`Saving to ${fileName}`);
await writeFile(fileName, JSON.stringify(employers, null, 2));
console.log(`All done`);
