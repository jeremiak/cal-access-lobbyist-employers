# Lobbyist employers from Cal-Access

The Secretary of State's website has some lobbying data but no data files to download beyond the 4+ gigabyte daily updated ZIP file that contains the contents of the entire Cal-Access system. That's way too much to deal with when we just want to know questions like:

1. How much are organizations spending to lobby California's government? Who are they?
2. Which organizations are lobbying on particular bills?

The `scrape.ts` script will download all of the lobbyist employers for a session, how much they spent per quarter, and what they lobbied on into a `.json` file.