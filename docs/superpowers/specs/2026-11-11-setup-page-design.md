# Setup page design

Date: 2026-11-11. Branch: `feat/setup-page`.

## Why

Mike is about to share the site on LinkedIn. A page listing his machines and connection shows clients and recruiters that he is a well-equipped, reliable remote contractor. It also fits the site's concept: every section looks like the ops tool that suits it, and hardware is what `fastfetch` prints.

## Goals

- A new tab, `/setup`, placed right after home, that lists Mike's machines grouped as work and home, each drawn as a `fastfetch`-style block.
- Entries are Markdown files in a new `content/machines/` collection, validated like every other collection.
- Mike can add, edit and publish machine entries from the admin panel without a code change.
- One line in the home-page login summary pointing at the tab.

## Non-goals

- No detail pages (`/setup/[slug]`). Everything fits on the list page. (My call, told to Mike, not objected to.)
- No tooling/software block and no separate network block. Network is a row on a machine.
- No live data. Nothing is read from the machine at build or run time.
- The LinkedIn share card and the phone intro wrapping are separate, later pieces of work.

## Anti-goals

- Nothing that maps Mike's home network: no ISP name, IP address, hostname, serial number or speed-test server location. The schema has no dedicated fields for them and the content must not carry them.
- No `fastfetch` icon or box-drawing characters in text. Martian Mono lacks those glyphs; frames and marks are CSS/SVG.
- No spec-sheet noise that goes stale: free disk space, usable RAM, "measured now".

## Content model

`content/machines/<slug>.md`, one file per machine. Frontmatter:

The collection is called `machines`, not `setup`, although the public tab is `/setup`. The admin uses a collection's key as its URL segment, and `/admin/setup` is already the one-time account-creation page, which would shadow the collection's listing. (My call: renaming the collection avoids both an admin refactor and moving a documented first-run URL.)

| Field | Type | Notes |
|---|---|---|
| `name` | string, required | Shown as the host in `mike@<name>`, for example `workpc` |
| `group` | `work` or `home`, required | Section the block appears under |
| `purpose` | string, optional | One line on what the machine is for |
| `order` | integer, optional | Sort within the group, ascending; entries without it come last, then by slug |
| `rows` | list of `{ label, value }`, at least one | Free label/value pairs: cpu, ram, ssd, net and whatever else |
| `sample` | boolean, default false | Same meaning as in other collections |

The Markdown body is an optional note shown under the block, rendered with the existing `Markdown` component.

`rows` is free-form on purpose, so a laptop can carry a `model` row and a server can skip `net` without a schema change.

### Initial entries

Mike supplied and confirmed these. Approved 2026-11-11.

`workpc` (group `work`):
- cpu: AMD Ryzen AI 9 HX 370, 12 cores / 24 threads
- ram: 128 GB (2x64 GB DDR5-5600)
- ssd: Samsung 990 PRO, 2 TB NVMe
- net: wired 1 Gbps, 923 down / 300 up, 2 ms ping

`server` (group `home`):
- cpu: AMD Ryzen 7 H 255
- ram: 64 GB (2x32 GB DDR5-5600)
- ssd: 1 TB NVMe
- net: wired 1 Gbps

`pc` (group `home`):
- cpu: AMD Ryzen AI Max+ 395, 16 cores / 32 threads
- ram: 64 GB LPDDR5X-8000
- ssd: 1 TB NVMe
- net: wired 1 Gbps

`laptop` (group `home`):
- model: Acer Swift 14
- cpu: Intel Core Ultra 7 155H, 16 cores / 22 threads
- ram: 32 GB (2x16 GB DDR5-6400)
- ssd: 1 TB NVMe

Set `order` so home reads server, pc, laptop. Drop trademark signs. `purpose` and notes are left empty until Mike writes them.

## The page

- Route `/setup`, heading `Prompt cmd="fastfetch"` with screen-reader label "Setup". Page metadata title "Setup".
- Two groups in the order work, home, each with a small lowercase heading. A group with no entries is not rendered. With no entries at all, show a dim "No machines listed yet." line, as other sections do.
- Each entry is one block: a `mike@<name>` title line (handle from the profile), the purpose line in dim when present, then the rows as a two-column label/value grid with labels dim, then the note.
- Color tokens only. Labels `--dim`, values `--fg`. No state colors needed.
- Entries are not links and carry no `data-nav-item`, so `j`/`k` do nothing on this page. That is accepted.
- Wide screens: blocks may sit in two columns from the same breakpoint the home page uses. Phone: one column, values wrap under a fixed-width label column without horizontal scroll at 390px.

Exact markup, spacing and whether the block gets a frame are left to the builder, within the design rules in `docs/CONTEXT.md` and the 2026-09-24 redesign spec.

## Navigation

- Keys count from zero (Mike's decision): home `~` moves from `1` to `0`, and `setup` takes `1` as the second tab. The other five are reordered (Mike's decision). `TABS` becomes `~` 0, setup 1, hobbies 2, languages 3, sport 4, travel 5, books 6. The tab row shows them in that order. Sitemap and key handling follow from `TABS`.
- Update the hard-coded "1-6" in `StatusLine.tsx` and `KeyboardNav.tsx` help to "0-6".
- Check the tab row still fits at 390px with seven tabs; if it doesn't, let it wrap or scroll the way the builder judges cleanest, and say which in the PR.

## Home page

One line in the login summary, first among the section lines to match the tab order (my call), linking to `/setup`: `<n> machines, wired 1 Gbps` style. The count comes from the collection. The connection phrase is the `net` row value of the first entry that has one, cut at the first comma; with no `net` row, the line is just the count. Logic goes in `src/lib/tui/motd.ts` with tests; the `samples` flags gain a `machines` entry. "First" means page order: work before home, then `order`, then slug. Use "1 machine" in the singular and omit the line when there are no entries.

## Admin

Add a `machines` spec (key `machines`, so it lives at `/admin/machines`) to `COLLECTIONS` in `src/lib/admin/collections.ts`:

- `name` text required, `group` select (`work`, `home`) required, `purpose` text, `order` number, `rows` yaml required with hint `- { label: cpu, value: "AMD Ryzen 7" }`, and the shared `sample` field.
- `titleOf` returns the name. Singular: `machine`.

Anything else the admin needs for a new collection (listing, repo paths, tests that enumerate collections) follows the existing six.

## Code touch points

- `src/lib/content/schemas.ts`: `machineSchema`. `collections.ts`: `Machine` type, `getMachines()`.
- `src/lib/tui/setup.ts`: pure grouping and sorting, unit tested.
- `src/app/setup/page.tsx`, `src/components/setup/`.
- `README.md` field reference gains the machines collection.
- `docs/CONTEXT.md`: add the route to the table, the new collection to the code map, and remove the stale "Replace sample content" item (done in PR #10).

## Done means

`npx eslint . && npx tsc --noEmit && npm test && npm run build` passes, the page is checked in both themes at 390px and at desktop width on `localhost:3000`, and a machine entry can be created, listed and saved through the admin at `/admin/machines` locally.

## Process

Feature branch `feat/setup-page`, PR, merge commit. No deploy; Mike runs the workflow by hand.
