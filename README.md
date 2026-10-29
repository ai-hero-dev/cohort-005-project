<div align="center">
<a href="https://www.aihero.dev/cohorts/software-factories-for-real-engineers-xdy1m">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://res.cloudinary.com/total-typescript/image/upload/v1786022423/github-project-header-dark_2x.png" />
    <source media="(prefers-color-scheme: light)" srcset="https://res.cloudinary.com/total-typescript/image/upload/v1786022424/github-project-header-light_2x.png" />
    <img src="https://res.cloudinary.com/total-typescript/image/upload/v1786022424/github-project-header-light_2x.png" width="421" height="102" />
    </picture>
</a>
</div>
<br/>

> The exercise repo for [Software Factories for Real Engineers](https://www.aihero.dev/cohorts/software-factories-for-real-engineers-xdy1m) (Cohort 005), a cohort-based course from Matt Pocock on building a software factory: agents that explore, implement and review your code, with the checks and feedback loops that keep them honest.

This is a full-stack course platform (think a mini Udemy) built with React Router, TypeScript, SQLite, and Drizzle ORM. It's the same codebase you met in the AI Coding Crash Course. Throughout this course, you'll put the brakes on first (review, automated checks, feedback loops), then build a factory that runs your agent in GitHub Actions.

Any coding agent that runs in a terminal and uses skills will work. Claude Code is the one used in the videos.

## Before You Start

**The [AI Coding Crash Course](https://www.aihero.dev/workshops/ai-coding-crash-course) is a prerequisite.** This course assumes you've done it, and builds directly on its ideas: context, `AGENTS.md`, skills, grilling, specs and tickets. If a lesson says "as we know from the crash course", that's where to look.

### Choosing Your Plan And Model

This course is written for Opus-level models. Budget for it:

- **$100/month is the practical minimum.** The Crash Course said a $20 plan was just enough; that advice doesn't hold here. You'll spend tokens freely while prototyping, and the factory adds its own usage on top.
- **The factory runs Opus on your subscription.** The GitHub Actions workflows run Claude Code with a token generated from your own Claude subscription.
- **Not using Claude?** Codex, OpenCode, Pi and other agents can't use a ChatGPT-style login inside CI. To run the factory with them, you'll need a provider API key, billed per token. GitHub Copilot is the exception: it runs on a Copilot plan, with a fine-grained personal access token that has the "Copilot Requests" permission, saved as the `COPILOT_GITHUB_TOKEN` secret. Its model is `claude-opus-5.5`, which needs Copilot Pro+, Max, Business or Enterprise; on another plan, pick a model your plan includes, such as `claude-sonnet-4.5`.

### Prerequisites

- [Node.js](https://nodejs.org/) v22+ (ships with npm v10+). This repo uses **npm**, not pnpm.
- [git](https://git-scm.com/)
- A GitHub account and the [GitHub CLI](https://cli.github.com/) (`gh`), logged in: run `gh auth status` to check, or `gh auth login` to sign in
- [jq](https://jqlang.org/download/), which some of the course scripts need
- A coding agent, installed and logged in (see the Crash Course)
- **On Windows, use [WSL](https://learn.microsoft.com/en-us/windows/wsl/install).** The course runs bash scripts, and `.claude/skills` is a symlink that a plain Windows checkout can break. Clone the repo inside WSL, not onto your Windows drive.

Quick check:

```bash
node --version   # v22 or later
git --version
gh auth status
jq --version
```

## Getting Started

```bash
# 1. Clone the course repo
git clone https://github.com/ai-hero-dev/cohort-005-project.git
cd cohort-005-project

# 2. Fork it into your own GitHub repo
npx ai-hero-cli fork

# 3. Install dependencies
npm install

# 4. Run database migrations and seed data
npm run db:migrate
npm run db:seed

# 5. Start the dev server
npm run dev
```

The app will be running at `http://localhost:5173`. Use the floating DevUI panel to switch between users.

### What `fork` does

`npx ai-hero-cli fork` turns your clone into your own repo:

- It replaces the folder's git history with a single fresh commit on `main`.
- It creates a new **public** GitHub repo on your account and pushes to it as `origin`.

It needs to be public: GitHub Actions minutes are free on public repos, and the factory runs there. Your issues live on your repo too, so the agent's backlog is yours, never the course repo's.

### Signing Up Later

You don't need these yet, but you'll be asked for them along the way. Both have a free option:

- **[Knock](https://knock.app/)**, a free Developer account, when you build notifications. Its keys go in `.env`, which is gitignored.
- **[tldraw](https://www.tldraw.com/)**, for whiteboarding your tasks. Any drawing app will do.

## Scripts

| Command                      | Description                                  |
| ---------------------------- | -------------------------------------------- |
| `npm run dev`                | Start the development server                 |
| `npm run build`              | Build for production                         |
| `npm run test`               | Run tests with Vitest                        |
| `npm run test:watch`         | Run tests in watch mode                      |
| `npm run typecheck`          | Type-check the project                       |
| `npm run db:generate`        | Generate a migration from the schema         |
| `npm run db:migrate`         | Run database migrations                      |
| `npm run db:seed`            | Reseed the database (drops and recreates it) |
| `npm run reset <slug>`       | Reset your repo to a lesson checkpoint       |
| `npm run cherry-pick <slug>` | Cherry-pick a lesson's solution              |
| `npm run pull`               | Merge the course repo's latest `main` in     |

## Course Structure

The course works through this codebase in eight sections:

1. **Before We Start**: Repo setup, choosing a model, the [Discord](https://www.aihero.dev/discord), office hours, and how to take the course.
2. **Domain Language**: Giving you and your agent a shared vocabulary.
3. **Wayfinder**: Charting a map of the work before you build it.
4. **Review**: Reviewing what your agent produces.
5. **Codebase Design**: Shaping the codebase so agents can work in it.
6. **Feedback Loops**: Automated checks that catch mistakes before you do.
7. **Software Factory Part One**: Running your agent in GitHub Actions.
8. **Software Factory Part Two**: Choosing the infrastructure your factory runs on, and designing the jobs you want it to do.

## Navigating Lessons

Each lesson that involves code has a checkpoint commit on the `live-run-through` branch, addressed by its **slug**. To jump to any point:

```bash
# Reset to a lesson's checkpoint (run with no slug to pick from a list)
npm run reset <slug>

# Cherry-pick a lesson's solution if you want to skip ahead
npm run cherry-pick <slug>
```

`reset` is destructive: it discards your commits and uncommitted changes that aren't in the checkpoint. It asks before it does, but commit or branch anything you want to keep first. `npm run reset main` takes you back to the starting point.

After a reset or cherry-pick, the code may need a different database or new dependencies. If in doubt, run all three:

```bash
npm install         # if package-lock.json changed
npm run db:migrate  # if the schema changed
npm run db:seed     # if the seed data changed
```

Your `.env` is gitignored, so it survives a reset.

## Tech Stack

- **Framework:** [React Router](https://reactrouter.com/) v8 with SSR
- **Language:** TypeScript 5.9
- **Database:** SQLite via [Drizzle ORM](https://orm.drizzle.team/)
- **Styling:** Tailwind CSS 4 + [shadcn/ui](https://ui.shadcn.com/)
- **Testing:** [Vitest](https://vitest.dev/)
- **Build:** [Vite](https://vite.dev/) 7

## License

This repository is for students of [Software Factories for Real Engineers](https://www.aihero.dev/cohorts/software-factories-for-real-engineers-xdy1m). All rights reserved.
