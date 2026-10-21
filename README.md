# The Localhost Times

[![CI](https://github.com/granvalenti76/the-localhost-times/actions/workflows/ci.yml/badge.svg)](https://github.com/granvalenti76/the-localhost-times/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-black.svg)](LICENSE)

*“All the news that never left the machine.”*

**A daily newspaper about your Mac, written by your local LLM.** Every morning at 7:00, The Localhost Times reads what your Mac did yesterday (the pages you visited in Safari, the mail you received, the commands you typed, the notes you wrote, the folders and repositories you worked in, the podcasts you heard) and a language model **running on your own machine** writes it up as a paper, in the manner of The New Yorker. It takes five minutes to read.

Nothing leaves your computer.

![The front page](docs/screenshots/front-page.png)

## Quick start

```bash
git clone https://github.com/granvalenti76/the-localhost-times.git
cd the-localhost-times
npm install
npm run demo        # a paper made of invented data → http://localhost:4321
```

The demo needs no permissions and no model. To print *your* paper:

```bash
npm run setup       # language, cadence, model, permissions: about a minute
npm start           # → http://localhost:4321
```

Press **Print now** in the timeline bar to see an edition right away. To keep it running in the background, see [docs/SETUP.md](docs/SETUP.md#run-it-in-the-background).

**You need** macOS, Node.js 22.13 or later, and ideally a local model server ([Ollama](https://ollama.com), [LM Studio](https://lmstudio.ai), [llama.cpp](https://github.com/ggml-org/llama.cpp)…): the paper finds it on its own. Without a model, it is still printed from templates, in plainer prose.

## What's in it

- **The front page:** a lead story, a few real stories (seven at most), *The Brief*, a New Yorker-style cartoon, and the records the day broke.
- **The website market:** every site you visit is a listed stock.
- **Spotlight:** patterns across weeks you may not have noticed (a decision in the making, a habit changing, a subject crossing apps), printed only when the evidence holds up, and never on delicate subjects.
- **The archive:** search everything, ask it a question in plain words, or open an investigation on a subject.
- **Every morning:** a notification with the lead headline, a one-minute radio bulletin read by your Mac's own voice, the RSS feed, the headline in the menu bar.
- **The newsroom**, if you want it: reorder, edit, rewrite or spike any piece, and leave tips for tomorrow.

The paper can also come out every hour or every week, in English or Italian. The house voice is in the [style guide](docs/STYLE.md).

## Privacy, in five lines

- The paper is served on `127.0.0.1` only, and keeps everything in `data/` in this folder.
- App databases are opened **read-only**; email bodies, file contents and Journal text are never read.
- The only thing sent anywhere is the stories' facts, to the model address *you* configured.
- Delicate subjects (health, money, love, faith, politics, the law, job hunting) are never turned into stories.
- No telemetry, no accounts, no cloud. More in [docs/PRIVACY.md](docs/PRIVACY.md).

## Why only the Mac

It is a paper about a Mac, written from the Mac's own apps: Safari, Mail, Notes, Terminal, Podcasts, Books, Photos, Calendar, Reminders, Files and Git. Chrome and Firefox are left out by choice. See [docs/SOURCES.md](docs/SOURCES.md).

## Documentation

| | |
|---|---|
| [SETUP.md](docs/SETUP.md) | The model, permissions, the background service, notifications, the menu bar, commands, troubleshooting |
| [CONFIG.md](docs/CONFIG.md) | Every setting in `config.json` |
| [SOURCES.md](docs/SOURCES.md) | What each source reads, how it works, adding a source |
| [PRIVACY.md](docs/PRIVACY.md) | What is read, what is never read, what leaves the machine |
| [STYLE.md](docs/STYLE.md) | The style guide: one voice for the whole paper |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to help |

## License

[MIT](LICENSE)
