# The frontend feedback loop

`npm run typecheck` and `npm run test` both pass against a page that renders
its server HTML and then does nothing at all. Neither of them loads the page
in a browser, so neither of them can see the one place that failure is
written down: the browser console.

`npm run check:console` reads it out loud.

```
npm run check:console                 # "/"
npm run check:console -- /dashboard   # one route
```

It starts the dev server if nothing is answering yet, loads the route once to
prime Vite's dependency optimizer and throws that load away, then opens the
route in headless Chrome and prints every console message, every uncaught
exception and every request the page failed to load — each with the file and
line Chrome blames.

The throwaway load matters. With no `node_modules/.vite` cache — a fresh
checkout, or the first load after a new dependency arrives — Vite answers the
page's requests with 504s while it pre-bundles, and then reloads the page.
Those 504s are the server's answers, so they never reach the exit code: without
the priming load, the first run printed optimizer noise and said green, and only
the second run showed the real failure.

## Reading the result

The exit code counts errors **from code that broke**, not from the server's
answers. `/dashboard` answers 401 until you pick a user in the DevUI panel,
every single time; that line is printed and then ignored. A `TypeError` from
a module the browser could not run is what turns the exit code red.

A page that hydrates says nothing, or says only what you told it to say.

## Settings

| Variable      | Default                 | For                                           |
| ------------- | ----------------------- | --------------------------------------------- |
| `APP_URL`     | `http://localhost:5173` | A server already running, or a different port |
| `CHROME_PATH` | _found automatically_   | A Chrome the script did not find              |
| `SETTLE_MS`   | `2500`                  | How long to listen after `load`               |
| `PRIME_SETTLE_MS` | `2000`              | How long to let Vite pre-bundle first         |

## How it works

`scripts/console-loop.ts` speaks the Chrome DevTools Protocol over a
WebSocket, which Node has built in. That is the whole reason it adds no
dependency: `Runtime.consoleAPICalled`, `Runtime.exceptionThrown`,
`Log.entryAdded` and `Network.loadingFailed` are the four events, and the
script prints what they carry.
