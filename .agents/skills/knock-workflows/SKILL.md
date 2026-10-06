---
name: knock-workflows
description: Create or change Knock workflows from code. Use when adding a Notification kind, changing a workflow's template or category, or when a trigger returns 404 because the workflow is missing.
---

# Knock Workflows

Knock workflows are **code**. Every one is pushed and committed by `npm run knock:push-workflows` through Knock's Management API, so the dashboard and `scripts/knock-wizard.sh` stay out of the loop.

The script reads two sources of truth:

- **Key and category:** `WORKFLOWS` and `CATEGORY_KEYS` in `app/lib/notifications.knock.server.ts`, which also send the Notification.
- **Name and feed body:** `TEMPLATES` in `scripts/push-knock-workflows.ts`. It is typed by `NotificationKind`, so a new kind fails the typecheck until its template is added.

## Steps

1. Edit the entries above for the kind you're adding or changing.
2. `npm run typecheck`.
3. `npm run knock:push-workflows`. It upserts and commits every workflow in Development, overwriting what's there, so re-running it is the fix for any drift. Add `-- --promote production` to promote them to Production.

Done when the script prints a ✓ for every workflow.

## Credentials

The script needs `KNOCK_SERVICE_TOKEN` and `KNOCK_FEED_CHANNEL_ID` in `.env`. The app's secret key only triggers workflows and is rejected by the Management API. When the token is missing, ask the human to create one in the Knock dashboard, under account settings → Service tokens.
