# Giving the agent a browser

`npm run check:console` prints what one page said. This is the other half:
driving the page, and asking it questions.

It uses [agent-browser](https://github.com/vercel-labs/agent-browser), a CLI
built for exactly this — one command per action, an answer on stdout.

## Once, per machine

```bash
npm install -g agent-browser
agent-browser install
```

## The loop

```bash
npm run check:dashboards
```

`.github/scripts/inspect-dashboards.sh`. It logs in as an admin, an
instructor and a student through the app's own DevUI panel, and for each one
writes two files into `screenshots/`:

- `NN-role-name.png` — the page, for a human.
- `NN-role-name.txt` — what the DOM answered, for an agent.

`.github/workflows/frontend-screenshot-poc.yml` runs the same script on a
GitHub Actions runner on demand, and comments the answers back onto the open
PR. Run `bash scripts/setup-pr-attach-pat.sh` once if you want the images in
the comment rather than a link to the artifact.

## Asking your own question

A screenshot is pixels. To verify a fix you need a yes or a no, so read the
DOM:

```bash
agent-browser open http://localhost:5173/dashboard
agent-browser find role button click --name "Switch user"
agent-browser find text "Sarah Chen" click --exact

# Is the panel closed again?
agent-browser eval '!!document.querySelector("form[action*=\"/api/switch-user\"]")'

# What does the sidebar say now?
agent-browser get text aside

# Did anything break?
agent-browser errors
agent-browser console
```

The commands worth knowing: `open`, `click`, `find <role|text|label> …`,
`wait`, `get text|html|attr|count`, `is visible|enabled|checked`, `eval`,
`snapshot` (the accessibility tree, with refs), `screenshot`, `console`,
`errors`, `close`. `agent-browser --help` has the rest.

**Ask the page, do not ask the person.** A change you have not looked at is a
change you are reporting on trust.

## Two things that will bite you

**Hydration lags "networkidle".** The button is in the server HTML before
React attaches its `onClick`, so the first click can be a silent no-op. Poll
for the click's effect and click again, rather than waiting a fixed time.

**Vite re-optimizes on the first load.** On a fresh checkout, the first page
load discovers dependencies Vite has not pre-bundled, and pushes a full-page
reload a moment after the response has finished. Absorb it once against a
throwaway load before the real loop; otherwise it lands mid-interaction and
every click after it hits a page that is already navigating away.
