# Changelog

All notable changes to The Localhost Times. The project follows [semantic versioning](https://semver.org) from its first release.

## 0.1.0 — first public release

The first version of the paper you read, not a newsroom you run.

### The paper
- **A daily paper by default**, out at 7:00 and covering the day before; hourly and weekly papers are still there, in the Settings.
- **Subjects**: the stories are what the owner was busy with, gathered across apps and days (a subject searched, watched, asked of an assistant and read in Books is one piece), not the sites it happened on.
- **Home Affairs (Interni)**: the projects' folder is chosen in the Settings; each repository is read, never written, for what changed (commits by the owner and by others, areas of the tree, files born and gone, dependencies, tags) and how it stands (work not committed, commits not pushed). A band on the front page, a board of every project, and a page per project.
- **The front page, laid out like a paper**: the masthead printed from the terminal, sections numbered as pages, the day in a strip, a lead with an engraving drawn for it, *in this issue*, *a year ago today*.
- **Fewer, real stories**: seven pieces at most, a newsworthiness threshold, twin stories merged, one simile per piece.

### Around the paper
- **The past from the first day**: on the first start the paper reads the history the Mac already keeps, prints the last week's editions and writes the **Year in Review**.
- **Remember**: "what was that article I read on Tuesday?" answered with the page itself and its link, from the archive, the menu bar or `npm run recall`.
- **The standup, written by itself**, from the commits, the pull requests, the terminal and the calendar.
- **Spotlight**, the website market, the radio bulletin, the RSS feed, the menu-bar headline, notifications, the background service.

### Privacy
- Served on `127.0.0.1` only; app databases opened read-only; old signals thinned, never shipped anywhere; no telemetry, no accounts, no cloud.
