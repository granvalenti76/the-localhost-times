# Sources

The paper is written from the Mac's own apps. Chrome, Firefox and other browsers are left out by choice: this is a paper about a Mac, written from the Mac's apps.

Every source can be turned off with `"sources": { "<name>": false }` in `config.json`, or set to *titles only* in **Settings → Sources**.

| Source | Name | Section | What is read |
|---|---|---|---|
| Safari | `safari` | World | History of this Mac (not iCloud), searches on Google & co., Gmail subjects in the browser |
| Mail | `mail` | Correspondence | Sender, subject, sent or received. **Not** the body of your emails. |
| Terminal | `terminal` | Workshop | `~/.zsh_history` / `~/.bash_history`, with tokens and passwords redacted |
| Notes | `notes` | Notebook | Notes created or edited: title, folder, a short excerpt |
| Journal | `journal` | Diary | Journal entries (experimental). The text stays **private** by default. |
| Podcasts | `podcasts` | Radio | Episodes played, and how far |
| Books | `books` | Culture | Books opened, progress, highlighted passages |
| Files | `files` | Local | Folders you worked in (via Spotlight) and downloads with the site they came from. **Not** file names (unless you enable them) or contents. |
| Apps | `apps` | Time | The app in front, noted once a minute (`lsappinfo`, or AppKit when `lsappinfo` can't see it from the background service), and when you're away from the keyboard. **Only app names**: never window titles or what's on screen. |
| The Mac | `power` | (front page) | When the Mac wakes, sleeps and runs on battery (`pmset -g log`) |
| Photos | `photos` | The Photographer | How many photos, videos and screenshots, and when. **Never** the pictures, places, people or file names. |
| Git | `git` | Workshop | The reflog of each repository under the Files folders: commits (with their message and size), merges, pulls, branch switches. Only what was done on this Mac. |
| Calendar | `calendar` | (context) | The appointments of the period (experimental). They don't make stories: they tell the writer that the hour of YouTube was the hour of the meeting. Delicate titles become "a private appointment"; birthdays and holidays are left out. |
| Reminders | `reminders` | Notebook | Reminders ticked off and added (experimental). Delicate titles become "a private reminder". |

Each story's facts end with **the same minutes from the other sources**: the apps in front, the appointments, the commits and the reminders of those minutes, so the writer can cross them.

## How it works

```
app databases (read-only) ─► collected every 5 min ─► data/*.sqlite (events)
                                                             │
                                          at press time      ▼
     stories (by site, thread, note, book…) ─► writer: local LLM, or typesetting
                                                             │
                     React front end (web/)  ◄──── Express API (server/)
```

1. **Collecting.** Every five minutes each source reads what changed in its app and stores it as events.
2. **Stories.** At press time the events of the period are grouped into stories (a site, a mail thread, a note, a book, a folder…). Twin stories are merged, and only the newsworthy ones become articles; the rest go to the briefs or are left out.
3. **Writing.** Each story gets a fact sheet, and the local model writes it in the house voice ([STYLE.md](STYLE.md)). The rules then check every draft: figures not in the facts, machine-made phrasing, the same simile twice. The managing editor (the model again) reads the first pieces and any the rules flag, and may send one back once.
4. **Printing.** The edition is laid out by the weight of its stories, with the cartoon, *The Brief*, the market, the records and the radio bulletin.

| Path | |
|---|---|
| `server/sources/` | One file per source (`locate()` + `collect()`) |
| `server/newsroom/cluster.js` | From events to stories, and the fact sheets the model writes from |
| `server/newsroom/edition.js` | Printing an edition, and the newsroom's desk operations |
| `server/newsroom/prompts.js` | The writers' instructions: the facts, the formats, the columns |
| `server/newsroom/voice.js` | The style guide as the writers read it (the examples are checked against `docs/STYLE.md` and `docs/STYLE.it.md`) |
| `server/newsroom/lint.js`, `chain.js`, `factcheck.js` | The rules, the managing editor and the copy desk, the fact check |
| `server/newsroom/fallback.*.js` | The automatic typesetting (templates, one file per language) |
| `server/newsroom/spotlight/` | Spotlight: the detectors, the leads, the writing |
| `server/newsroom/archive.js`, `investigations.js` | Search (SQLite FTS5), "Ask the archive", investigations |
| `server/service.js` | The macOS background service |
| `web/` | The paper: front page, articles, sections, archive, newsroom, settings |
| `test/` | Tests (`npm test`) |

## Adding a source

A source is one file in `server/sources/` that finds the app's database and returns events:

```js
{ id, source, kind, ts, title, detail, url, meta }
```

Then register it in `server/sources/index.js`, give it a section in `server/newsroom/sections.js`, and a story builder in `server/newsroom/cluster.js`. Add a fixture-based test in `test/`. See [CONTRIBUTING.md](../CONTRIBUTING.md).

## Journal is experimental

Apple doesn't document where Journal stores its entries on the Mac, so the collector looks for likely databases on its own. If it finds nothing, `npm run probe` lists the candidate folders and tables (names only, no contents): please [open an issue](https://github.com/granvalenti76/the-localhost-times/issues/new?template=journal.yml) with that output.
