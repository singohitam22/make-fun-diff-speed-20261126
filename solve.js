// A faster drop-in for makefun-diff 1.0.0 (make.fun's own line diff).
//
// Same answers as makefun-diff 1.0.0 on every input, computed faster:
//  - lines are interned to small integers once per run, so the search
//    compares integers instead of strings;
//  - the common prefix and suffix are trimmed on the integer arrays;
//  - Myers's greedy search runs on Int32Array rows with no allocation
//    inside the loop (the reference allocates a path object and a linked
//    list node per (d, k) step);
//  - the V row of every d is kept, so the edit script is rebuilt by
//    walking back from the first (d, k) that reaches both ends;
//  - the patch is formatted with array push + one join.
//
// The search follows the reference's rule exactly: on diagonal
// k = x - y, the furthest point of d edits is one old line past the
// (d-1)-point on k - 1 (a deletion) or one new line past the (d-1)-point
// on k + 1 (an insertion), whichever lies further into the old text,
// and the deletion when both reach the same point; no move past either
// text's end; no pruning of edge diagonals; from each point the path
// follows every run of lines equal in both as far as it goes; the first
// path to reach both ends is the script.

const KEEP = 0;
const DELETE = 1;
const INSERT = 2;

/** No path on a diagonal: outside the range of old positions (-1..). */
const NONE = -2;

/**
 * A text's lines (each with its "\n", the last one without when the text
 * does not end in one) together with the integer id of each line, drawn
 * from one shared interning table so equal lines share an id across
 * both texts. The empty text has no lines; "\n" has one, an empty line.
 */
function tokenize(text, intern) {
  const lines = [];
  let ids = new Int32Array(4096);
  let count = 0;
  let start = 0;
  const total = text.length;
  for (;;) {
    const nl = text.indexOf('\n', start);
    let line;
    if (nl < 0) {
      if (start >= total) break;
      line = text.slice(start);
    } else {
      line = text.slice(start, nl + 1);
      start = nl + 1;
    }
    lines.push(line);
    let id = intern.get(line);
    if (id === undefined) {
      id = intern.size;
      intern.set(line, id);
    }
    if (count === ids.length) {
      const bigger = new Int32Array(ids.length * 2);
      bigger.set(ids);
      ids = bigger;
    }
    ids[count++] = id;
    if (nl < 0) break;
  }
  return { lines, ids: ids.subarray(0, count) };
}

/**
 * The edit script of old ids A into new ids B as [kind, count] runs,
 * in order: the reference's Myers search, rebuilt from the V rows.
 * A run's kind is KEEP, DELETE or INSERT.
 */
function editRuns(A, B, n, m) {
  const rows = [];
  // d = 0: the path from (-1, -1) follows the common lines as far as it goes.
  const row0 = new Int32Array(1);
  let x = -1;
  let y = -1;
  // Padded arrays: the sentinel ids end the snake at either region's end.
  while (A[x + 1] === B[y + 1]) {
    x++;
    y++;
  }
  row0[0] = x;
  rows.push(row0);
  if (x + 1 >= n && y + 1 >= m) {
    return x + 1 > 0 ? [[KEEP, x + 1]] : [];
  }
  for (let d = 1; d <= n + m; d++) {
    const prev = rows[d - 1];
    const cur = new Int32Array(d + 1);
    let doneI = -1;
    // Row d holds d + 1 diagonals; index i is diagonal k = 2i - d.
    // Its deletion source is prev[i - 1] (diagonal k - 1 at d - 1) and
    // its insertion source is prev[i] (diagonal k + 1 at d - 1).
    // Diagonal k = -d (i = 0) can only insert; k = d (i = d) can only delete.
    // The snake runs on the padded arrays: a sentinel id ends it at either
    // region's end, so no explicit end checks are needed inside the loop.
    {
      const ad = prev[0];
      if (ad === NONE || ad + d >= m) {
        cur[0] = NONE;
      } else {
        let px = ad;
        let py = px + d;
        while (A[px + 1] === B[py + 1]) {
          px++;
          py++;
        }
        cur[0] = px;
        if (px + 1 >= n && py + 1 >= m) doneI = 0;
      }
    }
    if (doneI < 0) {
      for (let i = 1, k = 2 - d; i < d; i++, k += 2) {
        const rm = prev[i - 1];
        const ad = prev[i];
        const canRemove = rm !== NONE && rm + 1 < n;
        const canAdd = ad !== NONE && ad - k < m;
        if (!canRemove && !canAdd) {
          cur[i] = NONE;
          continue;
        }
        const byDeletion = canRemove ? rm + 1 : NONE;
        const byInsertion = canAdd ? ad : NONE;
        // The deletion when both reach the same point into the old text.
        let px = byDeletion >= byInsertion ? rm + 1 : ad;
        let py = px - k;
        while (A[px + 1] === B[py + 1]) {
          px++;
          py++;
        }
        cur[i] = px;
        if (px + 1 >= n && py + 1 >= m) {
          doneI = i;
          break;
        }
      }
    }
    if (doneI < 0) {
      const rm = prev[d - 1];
      if (rm === NONE || rm + 1 >= n) {
        cur[d] = NONE;
      } else {
        let px = rm + 1;
        let py = px - d;
        while (A[px + 1] === B[py + 1]) {
          px++;
          py++;
        }
        cur[d] = px;
        if (px + 1 >= n && py + 1 >= m) doneI = d;
      }
    }
    rows.push(cur);
    if (doneI >= 0) return backtrack(rows, d, doneI, n, m);
  }
  throw new Error('makefun-diff: the search ended without reaching both ends');
}

/** Rebuild the runs by walking back from the first (d, k) at both ends. */
function backtrack(rows, D, I, n, m) {
  const rev = [];
  let d = D;
  let i = I;
  while (d > 0) {
    const k = 2 * i - d;
    const prev = rows[d - 1];
    const rm = i > 0 ? prev[i - 1] : NONE;
    const ad = i < d ? prev[i] : NONE;
    const canRemove = rm !== NONE && rm + 1 < n;
    const canAdd = ad !== NONE && ad - k < m;
    const byDeletion = canRemove ? rm + 1 : NONE;
    const byInsertion = canAdd ? ad : NONE;
    const isDeletion = byDeletion >= byInsertion;
    const xPre = isDeletion ? rm + 1 : ad;
    const snake = rows[d][i] - xPre;
    if (snake > 0) rev.push([KEEP, snake]);
    rev.push([isDeletion ? DELETE : INSERT, 1]);
    i = isDeletion ? i - 1 : i;
    d--;
  }
  const first = rows[0][0] + 1;
  if (first > 0) rev.push([KEEP, first]);
  const runs = [];
  for (let j = rev.length - 1; j >= 0; j--) {
    const kind = rev[j][0];
    const count = rev[j][1];
    const last = runs.length > 0 ? runs[runs.length - 1] : undefined;
    if (last !== undefined && last[0] === kind) last[1] += count;
    else runs.push([kind, count]);
  }
  return runs;
}

/** A line as the patch writes it: its op, the line, a newline, and "%" on a line of its own when it had none. */
function written(op, line) {
  return line.endsWith('\n') ? op + line : op + line + '\n%\n';
}

/** makefun-diff 1.0.0's answer for one case's input: its patch of { old, new }, as one string. */
export function run(input) {
  if (input === null || typeof input !== 'object' || typeof input.old !== 'string' || typeof input.new !== 'string') {
    throw new TypeError('makefun-diff: the input is { old, new }, two strings');
  }
  const intern = new Map();
  const a = tokenize(input.old, intern);
  const b = tokenize(input.new, intern);
  const A = a.ids;
  const B = b.ids;
  const n = A.length;
  const m = B.length;
  // The common prefix, then the common suffix of what is left.
  let prefix = 0;
  while (prefix < n && prefix < m && A[prefix] === B[prefix]) prefix++;
  let suffix = 0;
  while (suffix < n - prefix && suffix < m - prefix && A[n - 1 - suffix] === B[m - 1 - suffix]) suffix++;
  const runs = [];
  if (prefix > 0) runs.push([KEEP, prefix]);
  // The middle region as padded id arrays: a sentinel id past each end
  // (distinct from every real line id and from each other) ends the
  // snake without explicit end checks.
  const midN = n - suffix - prefix;
  const midM = m - suffix - prefix;
  const midA = new Int32Array(midN + 1);
  midA.set(A.subarray(prefix, n - suffix));
  midA[midN] = intern.size;
  const midB = new Int32Array(midM + 1);
  midB.set(B.subarray(prefix, m - suffix));
  midB[midM] = intern.size + 1;
  const mid = editRuns(midA, midB, midN, midM);
  for (const r of mid) {
    const last = runs.length > 0 ? runs[runs.length - 1] : undefined;
    if (last !== undefined && last[0] === r[0]) last[1] += r[1];
    else runs.push(r);
  }
  if (suffix > 0) {
    const last = runs.length > 0 ? runs[runs.length - 1] : undefined;
    if (last !== undefined && last[0] === KEEP) last[1] += suffix;
    else runs.push([KEEP, suffix]);
  }

  // The change runs: each a stretch of deletions and insertions between two kept lines, at old line o and new line p.
  const changes = [];
  let o = 0;
  let p = 0;
  let deleted = 0;
  let inserted = 0;
  for (const r of runs) {
    const kind = r[0];
    const count = r[1];
    if (kind === KEEP) {
      o += count;
      p += count;
      continue;
    }
    let c = changes.length > 0 ? changes[changes.length - 1] : undefined;
    if (c === undefined || c.o + c.dels !== o || c.p + c.ins !== p) {
      c = { o, p, dels: 0, ins: 0 };
      changes.push(c);
    }
    if (kind === DELETE) {
      c.dels += count;
      o += count;
      deleted += count;
    } else {
      c.ins += count;
      p += count;
      inserted += count;
    }
  }

  // The hunks: change runs at most 2 * 3 kept lines apart share one.
  const hunks = [];
  for (const c of changes) {
    const h = hunks.length > 0 ? hunks[hunks.length - 1] : undefined;
    const prev = h !== undefined ? h[h.length - 1] : undefined;
    if (prev !== undefined && c.o - (prev.o + prev.dels) <= 6) h.push(c);
    else hunks.push([c]);
  }
  const out = [`makefun-diff/1 old=${n} new=${m} hunks=${hunks.length} deleted=${deleted} inserted=${inserted}\n`];
  for (const h of hunks) {
    const first = h[0];
    const last = h[h.length - 1];
    const oldStart = Math.max(0, first.o - 3);
    const newStart = first.p - (first.o - oldStart);
    const after = Math.min(3, n - (last.o + last.dels));
    const oldEnd = last.o + last.dels + after;
    const newEnd = last.p + last.ins + after;
    out.push(`@ ${oldStart + 1} ${oldEnd - oldStart} ${newStart + 1} ${newEnd - newStart}\n`);
    let at = oldStart;
    for (const c of h) {
      for (; at < c.o; at++) out.push(written('=', a.lines[at]));
      for (let j = 0; j < c.dels; j++) out.push(written('-', a.lines[c.o + j]));
      for (let j = 0; j < c.ins; j++) out.push(written('+', b.lines[c.p + j]));
      at = c.o + c.dels;
    }
    for (; at < oldEnd; at++) out.push(written('=', a.lines[at]));
  }
  return out.join('');
}
