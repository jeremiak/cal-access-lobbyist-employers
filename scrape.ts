// deno-lint-ignore-file no-explicit-any

import Queue from 'npm:p-queue@latest'
import _ from "npm:lodash@4.17";
import {
  DOMParser,
  Element,
  HTMLDocument,
} from "https://deno.land/x/deno_dom/deno-dom-wasm.ts";

interface Employer {
  id: string | undefined;
  name: string | undefined;
  quarters: Quarter[];
}

interface Quarter {
  quarter: string | undefined;
  session: string | undefined;
  generalLobbying: number | undefined;
  pucLobbying: number | undefined;
  lobbiedOn: string | undefined;
}

const concurrency = 4
const employerQueue = new Queue({ concurrency })
const employers: Employer[] = []
const financialActivityQueue = new Queue({ concurrency })
const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0'
const session = 2023

async function scrapeLobbyistEmployersForLetter(letter: string): Promise<Employer> {
  console.log(`Scraping lobbyist employers for ${letter}`)
  const url = `https://cal-access.sos.ca.gov/Lobbying/Employers/list.aspx?letter=${letter}&session=${session}`
  const response = await fetch(url)
  const html = await response.text()
  const { status } = response
  const doc: HTMLDocument | null = new DOMParser().parseFromString(
    html,
    "text/html",
  );

  const data: Employer[] = []
  const rows = doc?.querySelectorAll('#_ctl3_employers tbody tr')

  if (rows.length === 0) {
    console.log(letter, status)

    console.log(url, html)
  }

  rows?.forEach((row, i) => {
    if (i === 0) return
    const cells = row?.querySelectorAll('td')
    const name = cells[0].innerText
    const link = cells[0].querySelector('a')
    const href = link.getAttribute('href')
    const id = href.split('id=')[1].split('&')[0]
    data.push({
      id,
      name,
      quarters: []
    })
  })

  return data
}

async function scrapeLobbyistEmployerFinancialActivity(id: string): Promise<Quarter> {
  console.log(`Scraping financial history for ${id}`)
  const url = `https://cal-access.sos.ca.gov/Lobbying/Employers/Detail.aspx?id=${id}&view=activity&session=${session}`
  const response = await fetch(url)
  const html = await response.text()
  const doc: HTMLDocument | null = new DOMParser().parseFromString(
    html,
    "text/html",
  );

  const tbodies = doc?.querySelectorAll('tbody')
  const payments = tbodies[6]
  const lobbied = tbodies[7]

  if (!lobbied) {
    console.log(`No lobbying activity for ${id}`)
    return []
  }

  const paymentRows = payments.querySelectorAll('tr')
  const lobbiedRows = lobbied.querySelectorAll('tr')

  const quarters: Quarter[] = []

  for (let i = 2; i < paymentRows.length; i++) {
    const paymentCells = paymentRows[i].querySelectorAll('td')
    const lobbiedCells = lobbiedRows[i].querySelectorAll('td')
    const quarter = paymentCells[0].innerText.trim()
    const session = paymentCells[1].innerText.trim()
    const generalLobbying = +paymentCells[2].innerText.replaceAll(',', '').replace('$', '')
    const pucLobbying = +paymentCells[3].innerText.replaceAll(',', '').replace('$', '')
    const lobbiedOn = lobbiedCells[2].innerText

    quarters.push({
      quarter,
      session,
      generalLobbying,
      pucLobbying,
      lobbiedOn,
    })
  }

  return quarters
}

console.log(`Scraping for the ${session}-${session + 1} session`)

letters.split('').forEach(letter => {
  employerQueue.add(async () => {
    const employersForLetter: Employer[] = await scrapeLobbyistEmployersForLetter(letter)
    employers.push(...employersForLetter)
  })
})

await employerQueue.onIdle()

if (employers.length === 0) {
  console.log('Found zero lobbyist employers - something messed up and not going to save anything')
  Deno.exit(0)
}

employers.forEach(employer => {
  financialActivityQueue.add(async () => {
    const quarters: Quarter[] = await scrapeLobbyistEmployerFinancialActivity(employer.id)
    employer.quarters = _.orderBy(quarters, ['session', 'quarter'])
  })
})

await financialActivityQueue.onIdle()

console.log(`Sorting`)
const sorted = _.orderBy(employers, ["name", "id"]);
const fileName = `lobbyist-employers-financial-activity-${session}.json`
console.log(`Saving to ${fileName}`);
await Deno.writeTextFile(`./${fileName}`, JSON.stringify(sorted, null, 2));
console.log(`All done`);