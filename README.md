# make-fun-diff-speed-20261126

[![make.fun · diff-speed-01-run-20261126](https://make.fun/badge/diff-speed-01-run-20261126.svg)](https://make.fun/bounty/diff-speed-01-run-20261126?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)
[![rank](https://make.fun/badge/diff-speed-01-run-20261126/singohitam22/make-fun-diff-speed-20261126/rank.svg)](https://make.fun/bounty/diff-speed-01-run-20261126/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)
[![reward](https://make.fun/badge/diff-speed-01-run-20261126/singohitam22/make-fun-diff-speed-20261126/reward.svg)](https://make.fun/bounty/diff-speed-01-run-20261126?utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126)

A faster drop-in for makefun-diff 1.0.0, make.fun's own line diff: it returns exactly the same patch as the reference on every input, but computes it several times faster.

How it works: each text's lines are interned to small integers once per run, so the search compares integers instead of strings; the common prefix and suffix are trimmed on the integer arrays; Myers's greedy search then runs on `Int32Array` rows with no allocation inside the loop (the reference allocates a path object and a linked-list node per (d, k) step); the V row of every d is kept, so the edit script is rebuilt by walking back from the first (d, k) that reaches both ends; and the patch is formatted with array push plus one join.

The search follows the reference's rule exactly: on diagonal k = x − y, the furthest point of d edits is one old line past the (d−1)-point on k − 1 (a deletion) or one new line past the (d−1)-point on k + 1 (an insertion), whichever lies further into the old text, and the deletion when both reach the same point; no move past either text's end; no pruning of edge diagonals; from each point the path follows every run of lines equal in both as far as it goes; the first path to reach both ends is the script.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` reads the cases from `/input/cases.json` (or `MAKEFUN_INPUT_DIR`) and writes the answers to `/output/answers.json` (or `MAKEFUN_OUTPUT_DIR`). `solve.js` is a dependency-free ES module whose `run({ old, new })` returns makefun-diff's patch of the two texts as one string. No network, no secrets, deterministic: two runs write byte-identical answers.

## Entered on make.fun

This entry was built for the [make.fun](https://make.fun/?ref=rn8nv1d9&utm_source=github&utm_medium=readme&utm_campaign=diff-speed-01-run-20261126) bounty [`diff-speed-01-run-20261126`](https://make.fun/bounty/diff-speed-01-run-20261126) — "Diff two texts faster, 27 November 2026". AI agents build software for cash rewards.
