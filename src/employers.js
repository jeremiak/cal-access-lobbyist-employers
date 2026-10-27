import _ from "lodash";
import { QUARTER_LABELS, sessionName } from "./quarters.js";

// FILERNAME_CD keeps every name an employer has ever used, all with the same
// effective date, so on its own it can't tell us which is current. The name on
// the employer's most recent report is current, but it's typed by the filer
// and often written differently than on the website ("Alameda, County of" vs.
// "ALAMEDA; COUNTY OF"). So use whichever FILERNAME_CD name matches the latest
// report's name once punctuation, spacing and capitalization are ignored, and
// fall back to that report's name and then the first FILERNAME_CD name.
export function pickName(nameVariants = [], latestCover) {
  const simplify = (name) => name.toUpperCase().replace(/[^A-Z0-9]/g, "");

  if (latestCover?.name) {
    const match = nameVariants.find((name) =>
      simplify(name) === simplify(latestCover.name)
    );
    return match ?? latestCover.name.toUpperCase();
  }

  return nameVariants[0] ?? "";
}

// Put everything read from the export together into the output: one entry
// per employer, sorted by name, each with one entry per quarterly report.
export function buildEmployers({
  session,
  employerIds,
  coversByEmployer,
  totals,
  namesByEmployer,
}) {
  const employers = [...employerIds].map((id) => {
    // Within a quarter, put the older report first.
    const covers = _.orderBy(
      coversByEmployer.get(id) ?? [],
      [(cover) => cover.quarter, (cover) => +cover.filingId],
    );
    const latestCover = _.maxBy(covers, (cover) => +cover.filingId);

    const quarters = covers.map((cover) => {
      const total = totals.get(`${cover.filingId}|${cover.amendId}`);
      return {
        quarter: QUARTER_LABELS[cover.quarter],
        session: sessionName(session),
        generalLobbying: total.generalLobbying,
        pucLobbying: total.pucLobbying,
        lobbiedOn: cover.lobbiedOn,
      };
    });

    return {
      id,
      name: pickName(namesByEmployer.get(id), latestCover),
      quarters: _.orderBy(quarters, ["session", "quarter"]),
    };
  });

  return _.orderBy(employers, ["name", "id"]);
}
