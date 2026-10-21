# Security

The Localhost Times reads private data on your Mac, so a leak is a real bug: anything that sends what the paper reads to somewhere other than the model you configured, lets another device or website read the paper, or writes to an app's database.

## Reporting a problem

Please **don't open a public issue**. Report it privately through GitHub: **Security → Report a vulnerability** on this repository. Include what you found, how to reproduce it, and which version (commit) you ran.

You'll get an answer within a week. Fixes go to `main`, and the report is credited unless you'd rather not.

## Supported versions

Only the latest `main` is supported.

## What the paper promises

See [docs/PRIVACY.md](docs/PRIVACY.md). In short: served on `127.0.0.1` only, app databases opened read-only, requests for other hosts refused, data-changing calls guarded against other websites, no telemetry.
