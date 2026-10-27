// Quarter labels used by the website, for quarters 1 through 8 of a session.
export const QUARTER_LABELS = [
  "1st",
  "2nd",
  "3rd",
  "4th",
  "5th",
  "6th",
  "7th",
  "8th",
];

// A session is named for the odd year it starts in, so 2025 means 2025-2026.
export function sessionName(session) {
  return `${session}-${session + 1}`;
}

// Which quarter of the session (0 through 7) a date falls in. Dates in the
// export look like "4/1/2025 12:00:00 AM", which `new Date` understands.
// Dates outside the session give numbers outside 0 through 7, and dates that
// can't be read give null.
export function sessionQuarter(dateString, session) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return null;
  return (date.getFullYear() - session) * 4 + Math.floor(date.getMonth() / 3);
}
