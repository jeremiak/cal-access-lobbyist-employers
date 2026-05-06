import Queue from "p-queue";
import _ from "lodash";
import puppeteer from "puppeteer-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";
import { writeFile } from "fs/promises";

puppeteer.use(stealthPlugin());

const BROWSER_WIDTH_MINIMUM = 600;
const BROWSER_WIDTH_MAXIMUM = 1000;
const BROWSER_HEIGHT_MINIMUM = 800;
const BROWSER_HEIGHT_MAXIMUM = 900;
const BOT_BLOCKER_HTML_SNIPPET = `Incapsula`;

const randomHeightSize = Math.round(
  (Math.random() * (BROWSER_HEIGHT_MAXIMUM - BROWSER_HEIGHT_MINIMUM)) +
    BROWSER_HEIGHT_MINIMUM,
);
const randomWidthSize = Math.round(
  (Math.random() * (BROWSER_WIDTH_MAXIMUM - BROWSER_WIDTH_MINIMUM)) +
    BROWSER_WIDTH_MINIMUM,
);

// interface Employer {
//   id: string | undefined;
//   name: string | undefined;
//   quarters: Quarter[];
// }

// interface Quarter {
//   quarter: string | undefined;
//   session: string | undefined;
//   generalLobbying: number | undefined;
//   pucLobbying: number | undefined;
//   lobbiedOn: string | undefined;
// }

// const args = parse(Deno.args);
const concurrency = 4;
const employerQueue = new Queue({ concurrency });
const employers = [];
const financialActivityQueue = new Queue({ concurrency });
const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0";
const session = 2025; // args.session ? +args.session : 2025;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function scrapeLobbyistEmployersForLetter(
  page,
  letter,
) {
  console.log(`Scraping lobbyist employers for ${letter}`);
  const url =
    `https://cal-access.sos.ca.gov/Lobbying/Employers/list.aspx?letter=${letter}&session=${session}`;

  await page.setUserAgent({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
  });

  await page.setExtraHTTPHeaders({
    "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
    "Referer": "https://cal-access.sos.ca.gov/advanced.php",
  });

  await page.setViewport({
    width: randomWidthSize,
    height: randomHeightSize,
    deviceScaleFactor: 1,
  });

  await page.goto(url, {
    waitUntil: "networkidle0",
  });

  const pageHtml = await page.content();
  const isBlocked = pageHtml.includes(BOT_BLOCKER_HTML_SNIPPET);

  if (isBlocked) {
    console.log(`🚨🚨🚨 BOT BLOCKING DETECTED 🚨🚨🚨`);
    await page.screenshot({ path: "screenshot.png" });
    await delay(10000);
    // try again, it seems to work eventually
    return scrapeLobbyistEmployersForLetter(
      page,
      letter,
    );
  }

  const data = await page.evaluate((letter) => {
    const data = [];
    const rows = document.querySelectorAll("#_ctl3_employers tbody tr");

    if (rows.length === 0) {
      console.log("no rows", letter);
    }

    rows?.forEach((row, i) => {
      if (i === 0) return;
      const cells = row?.querySelectorAll("td");
      const name = cells[0].innerText;
      const link = cells[0].querySelector("a");
      const href = link.getAttribute("href");
      const id = href.split("id=")[1].split("&")[0];
      data.push({
        id,
        name,
        quarters: [],
      });
    });

    return data;
  }, letter);

  console.log({ data });
  return data;
}

async function scrapeLobbyistEmployerFinancialActivity(page, id) {
  console.log(`Scraping financial history for ${id}`);
  const url =
    `https://cal-access.sos.ca.gov/Lobbying/Employers/Detail.aspx?id=${id}&view=activity&session=${session}`;

  await page.setUserAgent({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
  });

  await page.setExtraHTTPHeaders({
    "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
    "Referer": "https://cal-access.sos.ca.gov/advanced.php",
  });

  await page.setViewport({
    width: randomWidthSize,
    height: randomHeightSize,
    deviceScaleFactor: 1,
  });

  await page.goto(url, {
    waitUntil: "networkidle0",
  });

  const pageHtml = await page.content();
  const isBlocked = pageHtml.includes(BOT_BLOCKER_HTML_SNIPPET);

  if (isBlocked) {
    console.log(`🚨🚨🚨 BOT BLOCKING DETECTED 🚨🚨🚨`);
    await page.screenshot({ path: "screenshot.png" });
    await delay(10000);
    return scrapeLobbyistEmployerFinancialActivity(
      page,
      id,
    );
  }

  const data = await page.evaluate((id) => {
    const tbodies = document?.querySelectorAll("tbody");
    const payments = tbodies[6];
    const lobbied = tbodies[7];

    if (!lobbied) {
      console.log(`No lobbying activity for ${id}`);
      return [];
    }

    const paymentRows = [...payments.querySelectorAll("tr")];
    const lobbiedRows = [...lobbied.querySelectorAll("tr")];

    const quarters = [];

    for (let i = 2; i < paymentRows.length; i++) {
      const paymentCells = paymentRows[i].querySelectorAll("td");
      const quarter = paymentCells[1].innerText.trim();
      const session = paymentCells[0].innerText.trim();
      const generalLobbying =
        +paymentCells[2].innerText.replaceAll(",", "").replace("$", "")
          .replaceAll("(", "").replaceAll(")", "") *
        (paymentCells[2].innerText.includes("(") ? -1 : 1);
      const pucLobbying = +paymentCells[3].innerText.replaceAll(",", "")
        .replace(
          "$",
          "",
        );

      const lobbiedRow = lobbiedRows.find((row) =>
        row.innerText.includes(quarter)
      );
      let lobbiedOn = null;

      if (lobbiedRow) {
        const lobbiedCells = lobbiedRow.querySelectorAll("td");
        lobbiedOn = lobbiedCells[2].innerText;
      }

      quarters.push({
        quarter,
        session,
        generalLobbying,
        pucLobbying,
        lobbiedOn,
      });
    }

    return quarters;
  }, id);

  return data;
}

const browser = await puppeteer.launch({
  headless: true,
  args: [
    "--enable-webgl",
    "--use-gl=swiftshader", // Or other appropriate GL renderer
  ],
});

console.log(`Scraping for the ${session}-${session + 1} session`);
letters.split("").forEach((letter) => {
  employerQueue.add(async () => {
    const ms = Math.round(Math.random() * 500);
    console.log(`Delaying ${letter} for ${ms} ms`);
    await delay(ms);
    const page = await browser.newPage();
    const employersForLetter = await scrapeLobbyistEmployersForLetter(
      page,
      letter,
    );
    employers.push(...employersForLetter);
    await page.close();
  });
});

await employerQueue.onIdle();

if (employers.length === 0) {
  console.log(
    "Found zero lobbyist employers - something messed up and not going to save anything",
  );
  process.exit(0);
}

employers.forEach((employer) => {
  financialActivityQueue.add(async () => {
    const ms = Math.round(Math.random() * 500);
    console.log(`Delaying ${employer.id} for ${ms} ms`);
    await delay(ms);
    try {
      const page = await browser.newPage();
      const quarters = await scrapeLobbyistEmployerFinancialActivity(
        page,
        employer.id,
      );
      employer.quarters = _.orderBy(quarters, ["session", "quarter"]);
      await page.close();
    } catch (e) {
      console.error(
        `Error scraping financial activity for ${JSON.stringify(employer)}`,
        e,
      );
    }
  });
});

await financialActivityQueue.onIdle();

console.log(`Sorting`);
const sorted = _.orderBy(employers, ["name", "id"]);
const fileName = `lobbyist-employers-financial-activity-${session}.json`;
console.log(`Saving to ${fileName}`);
await writeFile(`./${fileName}`, JSON.stringify(sorted, null, 2));
console.log(`All done`);
