# Lobbyist employers from Cal-Access

Process the daily export of the the Secretary of State's Cal-Access database to generate a JSON file of the lobbyist employers who reported in a two-year legislative session. Include the filer's ID number, name, reported expenditure by quarter as well as the self-reported subjects of the lobbying activity.

This data should help answer questions like:

1. How much are organizations spending to lobby California's government? Who are they?
2. Which organizations are lobbying on particular bills?

It runs on Github Actions once a day to update the data for the current session. If the icon below is green, the last scrape was successful. If the scrape failed the icon will be red.

[![Scrape lobbyist employers](https://github.com/jeremiak/cal-access-lobbyist-employers/actions/workflows/scrape.yml/badge.svg)](https://github.com/jeremiak/cal-access-lobbyist-employers/actions/workflows/scrape.yml)
