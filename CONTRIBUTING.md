# Contributing

Thanks for wanting to help. The Localhost Times is a small project with a clear shape, so a few words on what fits before you start.

## What the paper is

A paper you **read**, not one you run: a few real stories a day, in one voice, from the Mac's own apps, with nothing leaving the machine. Changes that keep it that way are welcome. Changes that add points, missions, cloud services or browsers other than Safari will probably be declined, however well made: please open an issue first if you are unsure.

## Getting started

```bash
git clone https://github.com/granvalenti76/the-localhost-times.git
cd the-localhost-times
npm install
npm run demo        # invented data, no permissions, no model needed
npm run dev         # hot reload → http://localhost:5173
npm test
```

Node.js 22.13 or later. The tests run on macOS and Linux and never touch your own data.

## Good first contributions

- **A new source.** One file in `server/sources/`, a section, a story builder and a test: see [docs/SOURCES.md](docs/SOURCES.md#adding-a-source). Open a [source request](https://github.com/granvalenti76/the-localhost-times/issues/new?template=source.yml) first so we can agree on what it reads and what it must never read.
- **Journal.** Apple doesn't document where Journal keeps its entries. If `npm run probe` finds nothing on your Mac, its output helps.
- **Local models.** Tried the paper with a model not listed anywhere? Tell us how it went: RAM, time per edition, how the prose read.
- **The automatic typesetting** (`server/newsroom/fallback.*.js`): the paper as printed without a model can always read better.

## Pull requests

- One change per pull request, with a test when it changes behaviour (`npm test` must stay green).
- Keep the code like the code around it: plain JavaScript modules, no new dependencies unless they are really needed, comments that say *why*.
- Anything the writers read follows the [style guide](docs/STYLE.md). If you change a rule, change it in `docs/STYLE.md`, `docs/STYLE.it.md` and `server/newsroom/voice.js` together.
- User-facing text comes in both languages (`{ en, it }`). If you don't speak Italian, write the English and say so in the pull request.
- **Privacy is not negotiable.** A source opens app databases read-only, reads as little as it needs, and never sends anything anywhere except the facts to the configured model. Never commit real personal data, not even in fixtures.

## Reporting bugs

Use the [bug report](https://github.com/granvalenti76/the-localhost-times/issues/new?template=bug.yml) form, and include the output of `npm run probe`. Read it before you paste it: it lists your sources and model, never their contents, but it's your Mac.

Security or privacy problems go through [SECURITY.md](SECURITY.md), not public issues.
