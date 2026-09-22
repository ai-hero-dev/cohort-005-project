---
name: mutation-testing
description: Reading a Stryker mutation report from JSON — list the surviving mutants and locate each one in the source. Use after `npm run test:mutation`, or when asked which mutants survived.
---

# Reading a mutation report

`npm run test:mutation` writes three files below `reports/`, and `.gitignore` excludes all of them. Read the report, not the cache:

- `reports/mutation/mutation.json` — **the report**: the result of the last run, and the file to query.
- `reports/mutation/mutation.html` — the same data, for a human to open in a browser.
- `reports/stryker-incremental.json` — the incremental **cache**. Same shape, but it carries results merged from earlier runs, so a mutant in it may be stale.

## The survivors

Every run, start here:

```bash
jq -r '.files | to_entries[] | .key as $file | .value.mutants[]
       | select(.status == "Survived" or .status == "NoCoverage")
       | "\($file):\(.location.start.line):\(.location.start.column)  \(.mutatorName)  ->  \(.replacement)"' \
  reports/mutation/mutation.json
```

Each line is one change to the source that the suite stayed green through. `replacement` is the mutated code; `location.start` is where it goes. To see the original, read those lines of the file — or slice the copy the report keeps in `.files[<path>].source`.

## The statuses

`status` decides whether a mutant is your problem:

| Status                                    | Meaning                                                             |
| ----------------------------------------- | ------------------------------------------------------------------- |
| `Survived`                                | A test ran the mutated code and passed. **Act on it.**              |
| `NoCoverage`                              | No test ran the mutated code at all. **Act on it.**                 |
| `Killed`, `Timeout`                       | A test caught the change. `statusReason` holds the failure message. |
| `CompileError`, `RuntimeError`, `Ignored` | Stryker could not test the mutant. Not a signal about your tests.   |

Other fields on a mutant: `id`, `killedBy` (test ids), `coveredBy`, `testsCompleted`. Test ids resolve against `.testFiles`.

## Acting on a survivor

A survivor is a review comment on the **test**, not on the implementation: the behaviour changed and the suite did not notice. For each one, either tighten the test until it fails against `replacement`, or state why that behaviour is unspecified and the mutant is accepted.

Done when every `Survived` and `NoCoverage` mutant in the report is accounted for.
