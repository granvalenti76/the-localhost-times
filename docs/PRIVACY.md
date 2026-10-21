# Privacy

The Localhost Times reads the most private machine you own, so it is built to keep what it reads on that machine.

- **Local by design.** The paper is served on `127.0.0.1`, so other devices on your network can't open it. Your editions live in `data/` in the project folder.
- **Read-only, and light.** App databases are opened read-only and never modified: small ones through a temporary copy, big ones (Mail's index can pass 500 MB) in place. A database that hasn't changed since the last look isn't read at all.
- **What leaves the machine:** only the stories' facts, sent to the model address you configured. If the model runs on this Mac, nothing leaves at all. Photos are fetched from the public web pages you visited, unless you turn them off in **Settings**; private, local and webmail pages are never fetched.
- **What is never read:** the body of your emails (unless you enable `privacy.mailIncludeSummary`), the text of Journal entries (unless `privacy.journalIncludeText`), locked notes, iCloud history from other devices, the contents of your files. File names stay out too unless you set `files.includeNames`; build folders (`node_modules`, `dist`, `.git`…) and hidden files are ignored. For apps, only their names are noted: never window titles or what's on screen.
- **Spotlight** connects signals the paper already has, and only on your Mac. It never opens a lead on delicate subjects (health, money troubles, love, faith, politics, the law, a job search), asks for your comment before every story, and lets you stop any lead. Turn it off with `"spotlight": { "enabled": false }`.
- **Filters.** `privacy.blockedDomains`, `privacy.blockedMailSenders`, `privacy.blockedNoteFolders` and `files.exclude` in `config.json` keep anything you choose out of the paper; `privacy.notesIncludeSnippet: false` keeps notes to their titles. Terminal commands are scanned for tokens, keys and passwords, which are redacted.
- **Other websites can't reach it.** Requests addressed to any host other than this Mac are refused, and data-changing API calls need a header that a page on another site can't send.
- **No telemetry, no accounts, no cloud.**

**Before you share a page**, remember that the paper is about you: its headlines name the sites you visited, the people who wrote to you and the folders you worked in.

Found a way the paper leaks something it shouldn't? See [SECURITY.md](../SECURITY.md).
