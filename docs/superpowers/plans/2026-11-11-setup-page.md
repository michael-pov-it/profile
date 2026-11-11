# Setup Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tab, `/setup`, on key `1` (home moves to `0`), that shows Mike's machines as `fastfetch`-style blocks, backed by a `machines` content collection that is editable in the admin panel.

**Architecture:** A new `content/machines/` collection goes through the existing loader and zod validation. Pure grouping and summary logic lives in `src/lib/tui/setup.ts`; a server component renders it at `/setup`. The tab, the home-page summary line and the admin collection spec each hook into the existing lists (`TABS`, `summarize`, `COLLECTIONS`).

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind 4, TypeScript, zod 4, gray-matter, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-11-11-setup-page-design.md`. Read it and `docs/CONTEXT.md` before starting.

## Global Constraints

- npm only. Stage files by name; never `git add -A` or `git add .`. Never commit `pnpm-lock.yaml` or `pnpm-workspace.yaml`.
- Work on the existing branch `feat/setup-page`. No deploy, no workflow changes.
- The collection is `machines` (`content/machines/`, `/admin/machines`). The public route is `/setup`. Do not create anything at `/admin/setup`: it is the account-creation page.
- Color tokens only: `--bg --fg --dim --warn --alert --band --rule`. Labels dim, values fg.
- Martian Mono has no box-drawing, block or symbol glyphs. No such characters in text; frames and marks are CSS/SVG.
- Headings are lowercase commands rendered by `Prompt` with a screen-reader label. No ALL-CAPS labels, no middle-dot separators.
- Content must not carry an ISP name, IP address, hostname, serial number or speed-test server location.
- No new dependencies.
- Each commit message ends with `Co-Authored-By: Claude <noreply@anthropic.com>`.

## Review Focus

- A machine with rows but no `net` row anywhere (laptop only): the home line shows the count alone, with no trailing comma.
- Only one group has entries: the empty group's heading is not rendered.
- Entries with and without `order` in the same group: ordered ones first ascending, the rest after by slug.
- A `net` row whose label is written `Net` or `NET`: still found for the home line.
- A long row value at 390px wide: it wraps under the value column; the page never scrolls sideways.

Each of these has a test or check in the task that owns the code (Tasks 2, 4 and 5).

---

### Task 1: Content model and entries

**Files:**
- Modify: `src/lib/content/schemas.ts`, `src/lib/content/collections.ts`
- Modify: `src/lib/content/schemas.test.ts`, `src/lib/content/content.test.ts`
- Create: `content/machines/workpc.md`, `server.md`, `pc.md`, `laptop.md`
- Modify: `README.md` (the Fields table)

**Interfaces:**
- Produces: `machineSchema`, `MACHINE_GROUPS = ['work', 'home'] as const` in `schemas.ts`; `type Machine = Entry<z.output<typeof machineSchema>>` and `getMachines(): Machine[]` in `collections.ts`. Parsed shape: `{ name: string; group: 'work' | 'home'; purpose?: string; order?: number; rows: { label: string; value: string }[]; sample: boolean; slug: string; body: string }`.

- [ ] **Step 1: Write failing schema tests** in `schemas.test.ts`, following the file's existing style:

```ts
describe('machineSchema', () => {
  const base = { name: 'workpc', group: 'work', rows: [{ label: 'cpu', value: 'x' }] };
  it('accepts a minimal machine and defaults sample', () => {
    expect(machineSchema.parse(base)).toEqual({ ...base, sample: false });
  });
  it('rejects an unknown group', () => {
    expect(machineSchema.safeParse({ ...base, group: 'office' }).success).toBe(false);
  });
  it('needs at least one row', () => {
    expect(machineSchema.safeParse({ ...base, rows: [] }).success).toBe(false);
  });
  it('rejects a row with an empty value', () => {
    expect(machineSchema.safeParse({ ...base, rows: [{ label: 'cpu', value: '' }] }).success).toBe(false);
  });
  it('rejects a fractional order', () => {
    expect(machineSchema.safeParse({ ...base, order: 1.5 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run** `npx vitest run src/lib/content/schemas.test.ts`. Expected: FAIL, `machineSchema` is not exported.

- [ ] **Step 3: Add `MACHINE_GROUPS` and `machineSchema`** to `schemas.ts` (name, purpose and row strings `min(1)`, `order` an integer, `sample` the shared default). Add `Machine` and `getMachines` to `collections.ts` with `loadCollection('machines', machineSchema)`.

- [ ] **Step 4: Add `['machines', getMachines]`** to the `it.each` table in `content.test.ts`.

- [ ] **Step 5: Create the four content files** with the values from the spec's "Initial entries", copied exactly. Frontmatter key order: `name`, `group`, `order`, `rows`. No `purpose`, no body. `workpc` is `order: 1`; home is `server` 1, `pc` 2, `laptop` 3. Quote every row value in YAML, because the values contain commas. Example:

```md
---
name: laptop
group: home
order: 3
rows:
  - { label: model, value: "Acer Swift 14" }
  - { label: cpu, value: "Intel Core Ultra 7 155H, 16 cores / 22 threads" }
  - { label: ram, value: "32 GB (2x16 GB DDR5-6400)" }
  - { label: ssd, value: "1 TB NVMe" }
---
```

- [ ] **Step 6: Add a `machines/` row** to the Fields table in `README.md`, in the table's existing format: required `name`, `group` (`work` / `home`), `rows`; optional `purpose`, `order`.

- [ ] **Step 7: Run** `npm test`. Expected: PASS, including the four new files.

- [ ] **Step 8: Commit** the files above by name: `Add machines content collection with four entries`.

---

### Task 2: Grouping and summary logic

**Files:**
- Create: `src/lib/tui/setup.ts`, `src/lib/tui/setup.test.ts`

**Interfaces:**
- Consumes: `Machine`, `MACHINE_GROUPS` from Task 1.
- Produces:
  - `groupMachines(machines: Machine[]): { group: 'work' | 'home'; machines: Machine[] }[]` — groups in `MACHINE_GROUPS` order, empty groups omitted, machines sorted by `order` ascending with entries lacking `order` last, ties and the unordered tail by slug.
  - `connectionPhrase(machines: Machine[]): string | undefined` — walks machines in `groupMachines` order, takes the first row whose label equals `net` case-insensitively, returns its value up to the first comma, trimmed.

- [ ] **Step 1: Write failing tests** in `setup.test.ts`. Build machines with a small helper `m(slug, group, order?, rows?)`. Assertions:

```ts
// groupMachines
expect(groupMachines([])).toEqual([]);
expect(groupMachines([m('pc', 'home')]).map((g) => g.group)).toEqual(['home']);
expect(groupMachines([m('pc', 'home'), m('workpc', 'work')]).map((g) => g.group)).toEqual(['work', 'home']);
// order first, then unordered by slug
expect(slugs(groupMachines([m('zeta', 'home'), m('b', 'home', 2), m('alpha', 'home'), m('a', 'home', 1)])[0]))
  .toEqual(['a', 'b', 'alpha', 'zeta']);

// connectionPhrase
const net = (value: string, label = 'net') => [{ label, value }];
expect(connectionPhrase([m('workpc', 'work', 1, net('wired 1 Gbps, 923 down / 300 up, 2 ms ping'))])).toBe('wired 1 Gbps');
expect(connectionPhrase([m('x', 'home', 1, net('wired 1 Gbps'))])).toBe('wired 1 Gbps');
expect(connectionPhrase([m('x', 'home', 1, net('wifi 6', 'NET'))])).toBe('wifi 6');
expect(connectionPhrase([m('laptop', 'home', 1, [{ label: 'cpu', value: 'c' }])])).toBeUndefined();
// page order decides, not input order
expect(connectionPhrase([m('h', 'home', 1, net('home line')), m('w', 'work', 1, net('work line'))])).toBe('work line');
```

- [ ] **Step 2: Run** `npx vitest run src/lib/tui/setup.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** both functions in `setup.ts`. No I/O, no React.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit**: `Add machine grouping and connection summary logic`.

---

### Task 3: New tab order and keys 0-6

**Files:**
- Modify: `src/lib/tui/tabs.ts`, `src/lib/tui/tabs.test.ts`, `src/lib/tui/keys.test.ts`
- Modify: `src/components/shell/StatusLine.tsx:13`, `src/components/shell/KeyboardNav.tsx:71`
- Modify: `README.md` Keyboard section where it names `1`–`6`

- [ ] **Step 1: Update tests first.** In `tabs.test.ts` rename the case to `assigns keys 0-6 in order` and expect `'0123456'`; add `expect(TABS.map((t) => t.href)).toEqual(['/', '/setup', '/hobbies', '/languages', '/sport', '/travel', '/books'])` and `expect(activeTabHref('/setup')).toBe('/setup')`. In `keys.test.ts` assert `0` goes to `/`, `1` to `/setup`, `2` to `/hobbies`, `3` to `/languages`, `4` to `/sport`, `5` to `/travel`, `6` to `/books`, and `7` resolves to `null`; replace the existing assertions that expect the old keys.
- [ ] **Step 2: Run** `npx vitest run src/lib/tui`. Expected: FAIL on the new assertions.
- [ ] **Step 3: Change `TABS`**: the array becomes, in this order, `~` key `'0'`, `{ key: '1', href: '/setup', label: 'setup' }`, hobbies `'2'`, languages `'3'`, sport `'4'`, travel `'5'`, books `'6'`. Change the visible `1-6` to `0-6` in `StatusLine.tsx` and `<kbd>1</kbd>-<kbd>6</kbd>` to `<kbd>0</kbd>-<kbd>6</kbd>` in `KeyboardNav.tsx`. Grep `src/` and `README.md` for any other place that shows a tab key next to its label and update it.
- [ ] **Step 4: Run** `npx vitest run src/lib/tui src/lib/content`. Expected: PASS (`routes.test.ts` picks `/setup` up through `TABS`).
- [ ] **Step 5: Commit**: `Add the setup tab and renumber tabs from 0`. The tab 404s until Task 4; that is fine within the branch.

---

### Task 4: The `/setup` page

**Files:**
- Create: `src/app/setup/page.tsx`, `src/components/setup/Fastfetch.tsx`

**Interfaces:**
- Consumes: `getMachines`, `getProfile`, `groupMachines`, `Prompt`, `Markdown`, `SampleTag`.
- Produces: `Fastfetch({ groups, handle }: { groups: ReturnType<typeof groupMachines>; handle: string })`.

- [ ] **Step 1: Write `page.tsx`**, modelled on `src/app/hobbies/page.tsx`: metadata title `Setup`, description `Machines and connection, printed the way fastfetch would.`; `<Prompt cmd="fastfetch" label="Setup" />`; with no machines render `<p className="text-dim">No machines listed yet.</p>`, otherwise `<Fastfetch />`.

- [ ] **Step 2: Write `Fastfetch.tsx`.**
  - One `<section>` per group with a level-2 `Prompt` heading: `cmd="fastfetch --group work"` / `--group home`, labels `Work` / `Home`.
  - One block per machine: title line `{handle}@{machine.name}` plus `SampleTag`, a thin rule under it drawn with a border in `--rule`, the `purpose` in dim when present, then the rows as a `<dl>` grid `grid-cols-[8ch_minmax(0,1fr)]` with `<dt>` dim and `<dd>` fg, then `<Markdown>` for a non-empty body.
  - Blocks are not links and have no `data-nav-item`.
  - Layout: one column by default; from `2xl` (the breakpoint `src/app/page.tsx` uses) the machines inside a group sit in two columns. `dd` must wrap (`min-w-0`, `break-words`).

- [ ] **Step 3: Check in the browser.** Start `npm run dev` if nothing is listening on port 3000. Take headless screenshots of `http://localhost:3000/setup` at `--window-size=390,844` and `2560,1440` (command form in `docs/CONTEXT.md` Gotchas; it captures the light theme). Confirm: four blocks under two headings, work first, home as server, pc, laptop; no horizontal scroll at 390px; all seven tabs are reachable at 390px, in the order ~, setup, hobbies, languages, sport, travel, books. Press `t` or load once with the dark theme to check both themes read correctly. If the tab row overflows at 390px, make it wrap and say so in the PR.

- [ ] **Step 4: Check the single-group case** by temporarily moving `workpc.md` out of `content/machines/`: the Work heading must disappear. Move it back.

- [ ] **Step 5: Run** `npx eslint . && npx tsc --noEmit`. Expected: clean.
- [ ] **Step 6: Commit**: `Add the setup page with fastfetch-style machine blocks`.

---

### Task 5: Home-page summary line

**Files:**
- Modify: `src/lib/tui/motd.ts`, `src/lib/tui/motd.test.ts`, `src/components/home/Motd.tsx`, `src/app/page.tsx`

**Interfaces:**
- Consumes: `Machine`, `connectionPhrase`.
- Produces: `summarize` input gains `machines: Machine[]`; `MotdSummary` gains `machines: number`, `connection?: string`, and `samples.machines: boolean`.

- [ ] **Step 1: Update `motd.test.ts`.** In the first case pass two machines, a work one with `net: 'wired 1 Gbps, 923 down / 300 up'` and a home one with only a `cpu` row and `sample: true`; expect `machines: 2`, `connection: 'wired 1 Gbps'`, `samples.machines: true`. In the empty case pass `machines: []` and expect `machines: 0`, `connection: undefined`, `samples.machines: false`. Add a case with one machine and no `net` row: `machines: 1`, `connection: undefined`.
- [ ] **Step 2: Run** `npx vitest run src/lib/tui/motd.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** in `motd.ts`; pass `machines: getMachines()` in `src/app/page.tsx`.
- [ ] **Step 4: Add the line to `Motd.tsx`** directly before the `Reading:` line (first of the section lines, matching the tab order), omitted (null) when `summary.machines === 0`:

```
  Hardware:    <Link href="/setup">4 machines, wired 1 Gbps</Link>
```

  The label is `'  Hardware:    '` so values stay aligned with the other lines. Use `1 machine` in the singular. With no `connection`, the link text is the count alone.
- [ ] **Step 5: Run** `npm test`, then load `http://localhost:3000/` and confirm the line reads `4 machines, wired 1 Gbps` and links to `/setup`. Expected: PASS.
- [ ] **Step 6: Commit**: `Show the machine count on the home-page summary`.

---

### Task 6: Admin collection

**Files:**
- Modify: `src/lib/admin/collections.ts`, `src/lib/admin/entry.test.ts`

- [ ] **Step 1: Write a failing test** in `entry.test.ts`, next to the hobbies case at line 72 and using the same helpers: build a `machines` form with `name: 'laptop'`, `group: 'home'`, `order: '3'`, `rows: '- { label: cpu, value: "Core Ultra 7" }'`, convert it to a file and back, and expect the parsed data to equal `{ name: 'laptop', group: 'home', order: 3, rows: [{ label: 'cpu', value: 'Core Ultra 7' }] }`. Add a second case: `rows: ''` is rejected with an error naming `rows`.
- [ ] **Step 2: Run** `npx vitest run src/lib/admin/entry.test.ts`. Expected: FAIL, `collectionSpec('machines')` is undefined.
- [ ] **Step 3: Add the spec** to `COLLECTIONS` after `hobbies`:
  - `key: 'machines'`, `label: 'machines'`, `singular: 'machine'`, `schema: machineSchema`, `titleOf: (d) => str(d.name)`.
  - Fields in this order: `name` text required (label `Name`, hint `shown as mike@name`); `group` select required, options `MACHINE_GROUPS`; `purpose` text (label `What it is for`); `order` number (hint `position within the group, lowest first`); `rows` yaml required (hint `one per line: - { label: cpu, value: "AMD Ryzen 7" }`); the shared `sample`.
- [ ] **Step 4: Run** `npx vitest run src/lib/admin`. Expected: PASS, including the loop over `COLLECTIONS` at line 112.
- [ ] **Step 5: Check in the browser** with the local admin (setup steps in `README.md`, "Admin panel"): `/admin` lists `machines` with count 4, `/admin/machines` lists the four entries, opening `laptop` shows its rows in the YAML field, and saving it unchanged leaves `content/machines/laptop.md` with no diff beyond formatting. If saving rewrites the row formatting, keep the admin's format and re-save all four files so they are consistent.
- [ ] **Step 6: Commit**: `Make machines editable in the admin panel`.

---

### Task 7: Docs, full check, PR

**Files:**
- Modify: `docs/CONTEXT.md`, `README.md` (intro sentence)

- [ ] **Step 1: Update `docs/CONTEXT.md`:** add the `/setup` row to the route table (`fastfetch` blocks per machine, grouped work and home); add `machines/` to the content list and `setup` to the `src/lib/tui/` per-section list; change the keyboard rule to `0`–`6`, reorder the route table to the new tab order and note the key for each; delete the "Replace sample content" backlog item and the sample-content sentence under "Going public later" (done in PR #10); set "Last updated" to 2026-11-11. Add `fastfetch` for setup to the `README.md` intro sentence.
- [ ] **Step 2: Run** `npx eslint . && npx tsc --noEmit && npm test && npm run build`. Expected: all pass, and the build output lists `/setup` as a static route.
- [ ] **Step 3: Commit** the docs together with the spec and this plan: `Document the setup page`.
- [ ] **Step 4: Push and open a PR** against `main` titled `Add setup page with machines collection`. In the body: what was added, the screenshots' findings (390px and wide, both themes), and whether the tab row needed a change. End the body with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Do not merge and do not deploy.
