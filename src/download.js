import { createWriteStream } from "fs";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

const EXPORT_URL = "https://campaignfinance.cdn.sos.ca.gov/dbwebexport.zip";

export async function downloadExport(path) {
  console.log(`Downloading ${EXPORT_URL} to ${path}`);
  const response = await fetch(EXPORT_URL);

  if (!response.ok) {
    throw new Error(
      `Couldn't download the export: ${response.status} ${response.statusText}`,
    );
  }

  // The export is around 1.6 GB, so stream it straight to disk instead of
  // holding it in memory, and log progress every 100 MB so it's clear the
  // script hasn't hung.
  const totalBytes = +response.headers.get("content-length");
  let downloadedBytes = 0;
  let nextLogAt = 0;
  const body = Readable.fromWeb(response.body);

  body.on("data", (chunk) => {
    downloadedBytes += chunk.length;
    if (downloadedBytes >= nextLogAt) {
      const percent = totalBytes
        ? ` (${Math.round((downloadedBytes / totalBytes) * 100)}%)`
        : "";
      console.log(
        `Downloaded ${Math.round(downloadedBytes / 1e6)} MB${percent}`,
      );
      nextLogAt += 100e6;
    }
  });

  await pipeline(body, createWriteStream(path));
}
