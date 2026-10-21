# Configuration

`npm run setup` writes `config.json` for you. To edit it by hand, start from [`config.example.json`](../config.example.json). Every field is optional: whatever you leave out keeps its default. After a change, restart the paper (`npm run service:restart` if it runs as a service).

How often the paper comes out, the sources' weight and the bylines are set in the paper itself, under **Settings**, and kept in `data/`.

| Setting | Default | What it does |
|---|---|---|
| `language` | `"en"` | `"en"` or `"it"` |
| `port` | `4321` | Where the paper is served |
| `host` | `"127.0.0.1"` | Only this Mac can open the paper. `"0.0.0.0"` shares it with your network: anyone on it could read it. |
| `llm.baseUrl` | `"auto"` | `"auto"` finds a local server; a URL ending in `/v1`; or `""` for no model |
| `llm.model` | `""` | Model name; empty = the server's first chat model |
| `llm.apiKey` | `""` | Only if your server wants one |
| `llm.timeoutMs` | `300000` | How long to wait for each answer |
| `llm.concurrency` | `1` | Requests in parallel (1 suits local servers) |
| `llm.temperature` | `0.7` | How free the writers are with their words |
| `llm.thinking` | `false` | Let "thinking" models reason before writing (slower) |
| `sources.<name>` | `true` | Turn a source off (see [SOURCES.md](SOURCES.md)) |
| `files.folders` | Desktop, Documents, Downloads, Work, Developer, Projects, Code… | Folders the Local section watches |
| `files.exclude` | `[]` | Parts of paths to leave out, e.g. `"Documents/Medical"` |
| `files.includeNames` | `false` | Put file names in the paper (otherwise only folders, types and counts) |
| `git.folders` | the Files folders | Where to look for git repositories |
| `git.exclude` | `[]` | Parts of paths to leave out |
| `privacy.*` | | See [PRIVACY.md](PRIVACY.md) |
| `edition.maxArticles` | `9` | Articles per hourly edition; a daily prints about four fifths of it |
| `edition.minEvents` | `8` | Hourly paper: quieter hours merge into the next edition… |
| `edition.maxMergeHours` | `3` | …up to this many hours |
| `edition.eveningHour` | `21` | Hourly paper: when the evening edition comes out (`null` = never) |
| `desk.chain` | `"triage"` | Which articles the managing editor (the model) reads before print: `"triage"` (the first three, and every other piece the rules flag), `"all"`, `"top"`, `"lead"`, `"off"` |
| `desk.rounds` | `[20, 40]` | Hourly paper: minutes of the hour when the next edition is drafted; `[]` writes everything at the press |
| `desk.draftTop` | `5` | Hourly paper: how many of the strongest stories get a draft during the hour |
| `notifications.enabled` | `true` | macOS notification for every edition |
| `apps.sampleSeconds` | `60` | How often the app in front is noted |
| `apps.exclude` | `[]` | Apps never recorded, e.g. `["Messages"]` |
| `photos.library` | `""` | Another Photos library (empty = the system one) |
| `tips.notesFolder` | `""` | A Notes folder used as the tip box (“Newsroom” always works) |
| `spotlight.enabled` | `true` | The Spotlight desk |
| `spotlight.replyMinutes` | `60` | Your right of reply before a Spotlight story is printed (`0` = no wait) |
| `spotlight.goal` | `70` | How strong (0–100) a lead must be before it is weighed; higher means fewer, surer stories |
| `radio.enabled` | `true` | Record the radio bulletin of every edition |
| `radio.voice` | `""` | A `say` voice (list them with `say -v '?'`); empty = one that speaks the paper's language |
| `radio.rate` | `180` | Words per minute |
| `collectEveryMinutes` | `5` | How often the sources are read |
| `backfillHours` | `1` | Editions to catch up on after the Mac was off |
| `keepEventsDays` | `60` | How long raw signals are kept whole; after that the moments (apps, power, files saved) go and one of each page, search, book or message a day stays, so the archive keeps remembering. `0` = keep everything |
| `history.days` | `365` | On the first start, how much of the past the Mac keeps is read into the archive (`0` = none) |
| `history.catchUp` | `7` | And how many past days get their edition (a weekly paper: that many days' worth of weeks) |
| `history.keep` | `true` | `false` forgets old signals altogether instead of thinning them |
| `standup.exclude` | `[]` | Repositories (names or parts of paths) the standup leaves out |

Environment variables override the file: `LOCALHOST_TIMES_LANG`, `LOCALHOST_TIMES_LLM_URL`, `LOCALHOST_TIMES_LLM_MODEL`, `PORT`.
