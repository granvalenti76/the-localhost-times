# Setup

- [Requirements](#requirements)
- [The writer: a local model](#the-writer-a-local-model)
- [Permissions](#permissions)
- [When the paper comes out](#when-the-paper-comes-out)
- [The first start](#the-first-start)
- [Your projects: Home Affairs](#your-projects-home-affairs)
- [Run it in the background](#run-it-in-the-background)
- [Updating](#updating)
- [Commands](#commands)
- [Troubleshooting](#troubleshooting)

## Requirements

| | |
|---|---|
| **macOS** | The sources are macOS apps. On other systems only the demo works. |
| **Node.js 22.13 or later** | `brew install node`, or `nvm install 22` (there's an `.nvmrc`). Check with `node -v`. |
| **A local language model** *(optional)* | Any OpenAI-compatible server: [Ollama](https://ollama.com), [LM Studio](https://lmstudio.ai), [llama.cpp](https://github.com/ggml-org/llama.cpp), vLLM… Without one, the paper is still printed by the *automatic typesetting*: plainer articles from templates. |

No database or Python to install: storage is SQLite, built into Node.

## The writer: a local model

By default the paper **finds your model by itself**. It looks for Ollama (port 11434), LM Studio (1234), llama.cpp (8080) and vLLM (8000) on this Mac, and uses the first chat model it finds.

For example, with Ollama:

```bash
brew install ollama
ollama serve &              # or open the Ollama app
ollama pull gemma3:4b       # any chat model works; small ones are fine
npm start
```

**Model on another computer** (a home server, a desktop with a GPU): run `npm run setup` and type its address, or set it in `config.json`:

```json
{ "llm": { "baseUrl": "http://192.168.1.20:8080/v1", "model": "" } }
```

Leave `model` empty to use the server's first model. Small local models (3–8B parameters) are enough: the facts are prepared for them, and they only have to write. Requests go one at a time (`llm.concurrency`), and each one may take up to `llm.timeoutMs` (5 minutes by default), so slow machines work too.

When the model is off or doesn't answer, the paper doesn't stop: that edition is written by the automatic typesetting, and the model picks up again at the next one.

## Permissions

Safari, Mail, Notes, Podcasts, Books and Journal keep their data in folders protected by macOS, and so are Desktop, Documents and Downloads (for the Local section, which also needs Spotlight, on by default). To read them, the app you run the paper from needs **Full Disk Access**:

1. Open **System Settings → Privacy & Security → Full Disk Access**.
2. Turn on the app you start the paper from: **Terminal**, iTerm, VS Code…
3. Quit that app completely (⌘Q) and reopen it.

Check with `npm run probe`: every source shows ✓ (readable), ⛔ (blocked) or · (app not used on this Mac). `npm run setup` can open the right settings page for you.

If your model runs on another computer, macOS may also ask whether the app can find devices on your **Local Network**: say yes.

**Precise times for Terminal commands.** By default zsh saves the history without timestamps, and only when a window closes. Add this line to `~/.zshrc`, then open a new window:

```zsh
setopt EXTENDED_HISTORY INC_APPEND_HISTORY
```

## When the paper comes out

By default the paper is a **daily**: it goes to press at 7:00 and covers the 24 hours before. `npm run setup` asks, and **Settings → Output** in the paper changes it at any time:

- **Every morning** (recommended), at the hour you choose.
- **Every hour**, with an evening edition at 21:00 (`edition.eveningHour`). Livelier, and much more work for the model.
- **Every week**, on the day you choose.

## The first start

The first time it runs, the paper reads the past your Mac already keeps: about a year of Safari history, Mail, Books, Podcasts, Notes, Photos, the shell history and the git reflogs (`history.days`). It takes a minute or two. Then it prints the editions of the last seven days (`history.catchUp`), oldest first, and writes the Year in Review (**Archive → The Year in Review**). With a model, each past edition takes as long as a normal one: they come out in the background while you read.

Already running the paper from before? `npm run history` does the same at any time.

## Your projects: Home Affairs

**Settings → Home Affairs** (Interni) is where the paper learns where your code lives. Press **Choose the folder…** (the Mac's own folder picker opens) or type its path, for example `~/Work/git`. The paper lists the git repositories inside it, up to three levels down, each with the first line of its README and how it stands.

- Switch off the ones that aren't yours (a clone of someone else's project) with **Out**.
- Give a repository the name the paper should call it by.
- Every project has its own page: its chronicle, thirty days of commits, where the work went, its dependencies.

The repositories are only read, with `git log`, `git status` and `git show`: the paper never writes to them, fetches or pushes. Without a folder chosen, it looks in the folders of the Files source.

## Run it in the background

Instead of keeping a Terminal window open, install the paper as a background service. It starts at every login, restarts if it crashes, and prints on its own:

```bash
npm run service:install     # builds the site, installs and starts the service
npm run service:status      # is it running? can it read the sources?
npm run service:restart     # rebuild and restart: after an update or a change to config.json
npm run service:stop        # stop it (it starts again with service:start, or at the next login)
npm run service:start       # start it again
npm run service:logs        # follow the log (Ctrl-C to quit)
npm run service:uninstall   # stop it and remove it for good (your editions stay in data/)
```

While the service is running, `npm start` would find the port taken: use `service:stop` first if you want to run the paper in a Terminal window.

As a service, the paper runs as `node` and not inside Terminal, so macOS asks for Full Disk Access again, **for `node` itself**. The install command prints the exact path to add, and `service:status` reminds you if a source is blocked. After a Node.js upgrade the path changes: add the new one.

**Notifications.** When an edition is out you get a macOS notification with the lead headline (turn it off with `"notifications": { "enabled": false }`). Try it with `npm run notify:test`. With `brew install terminal-notifier`, clicking the notification opens the edition.

**The radio bulletin.** Every edition is read aloud in about a minute by your Mac's own voice (`say`), with a player on the front page. Subscribe in Podcasts: *File → Follow a Show by URL…* → `http://localhost:4321/radio.xml`.

**The headline in the menu bar.** With [SwiftBar](https://swiftbar.app) (free) the lead headline sits in the macOS menu bar; click it for the edition's stories and quick links to the paper:

```bash
brew install --cask swiftbar   # open it once and choose a plugin folder
npm run menubar:install        # adds the plugin (xbar works too)
npm run menubar:uninstall      # removes it
```

It refreshes every 5 minutes and only asks the paper on this Mac (`/api/menubar`). The menu also has **Remember…** (the archive's memory) and **Copy the standup**, which puts yesterday's standup on the clipboard.

**Export** (in the timeline bar) prints the front page to PDF in A4 or A3 broadsheet, saves it as a 1200×630 image, or gives you the RSS feed (`/feed.xml`, or `/feed/<section>.xml` for one section).

## Updating

```bash
git pull
npm install
npm run service:restart     # if it runs as a service; otherwise stop npm start (Ctrl-C) and run it again
```

Your editions, settings and `config.json` are kept. New settings get their defaults automatically.

## Commands

| Command | |
|---|---|
| `npm run setup` | Guided setup (safe to run again) |
| `npm start` | Build the site and start the paper |
| `npm run demo` | The paper with invented data, no permissions needed |
| `npm run probe` | Check sources, permissions and the model |
| `npm run print -- --hours 3` | Print the editions of the last hours now |
| `npm run rebuild` | Wipe the paper and reprint the last 12 hours |
| `npm run photos -- --hours 4` | Trace the photo search, page by page |
| `npm run service:install` | Install and start the background service |
| `npm run service:restart` / `stop` / `start` | Restart (after an update), stop, start the service |
| `npm run service:status` / `logs` / `uninstall` | Check it, follow its log, remove it |
| `npm run notify:test` | Send a test notification |
| `npm run tip -- "…"` | A tip for the newsroom (goes into the next edition) |
| `npm run history [-- --days 365]` | Read the past the Mac keeps, print the last days, write the Year in Review (done by itself on the first start) |
| `npm run recall -- "…"` | *What was that thing?* The archive answers with the pages and their links |
| `npm run standup [-- --week] [--copy]` | The standup since the last working day (or this week), copied to the clipboard with `--copy` |
| `npm run menubar:install` / `uninstall` | Add or remove the menu-bar headline (SwiftBar or xbar) |
| `npm run dev` | Development, with hot reload → http://localhost:5173 |
| `npm test` | Run the tests |

## Troubleshooting

**`npm start` says Node is too old, or `vite: command not found`.** Install Node 22.13+ and run `npm install` in the project folder.

**The paper is empty.** The first edition comes out at the next press time. Press **Print now** to print one right away. Run `npm run probe`: ⛔ means a permission is missing (see [Permissions](#permissions)).

**"Writer offline" / "automatic typesetting".** The model isn't reachable. `npm run probe` shows the reason. Check that your model server is running (`curl http://127.0.0.1:11434/v1/models` for Ollama), or that the address in `config.json` ends in `/v1`. For a model on another computer, check the macOS Local Network permission.

**Articles get cut or the model times out.** Use a smaller model, raise `llm.timeoutMs`, and keep `llm.thinking` off.

**Terminal commands have no times.** See the zsh line under [Permissions](#permissions).

**Port 4321 is already in use.** The paper is probably already running, maybe as a service (`npm run service:status`). Or set another `port`.

**The service starts but sources are blocked.** Give Full Disk Access to `node` itself: `npm run service:status` prints its path.

**`config.json is not valid JSON`.** Fix the file, or delete it and run `npm run setup`.
