import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { describe, expect, it } from 'vitest';
import { COLLECTIONS, collectionSpec } from './collections';
import { buildEntry, dump, emptyForm, entryTitle, parseEntry } from './entry';

const books = collectionSpec('books')!;

function form(spec: typeof books, values: Record<string, string>, body = '') {
  return { values: { ...emptyForm(spec).values, ...values }, body };
}

describe('buildEntry', () => {
  it('builds a valid book and leaves schema defaults out of the file', () => {
    const result = buildEntry(
      books,
      'my-book',
      form(books, { title: 'My Book', author: 'Me', status: 'queued', languages: 'EN, UA' }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toBe('---\ntitle: My Book\nauthor: Me\nstatus: queued\nlanguages: [ EN, UA ]\n---\n');
    expect(matter(result.text).data).toMatchObject({ languages: ['EN', 'UA'] });
  });

  it('reports schema errors against the field that caused them', () => {
    const result = buildEntry(books, 'x', form(books, { title: 'T', author: 'A', status: 'reading', languages: 'EN' }));
    expect(result).toMatchObject({ ok: false, errors: { progress: expect.stringContaining('progress') } });

    const noLang = buildEntry(books, 'x', form(books, { title: 'T', author: 'A', status: 'queued' }));
    expect(noLang).toMatchObject({ ok: false, errors: { languages: expect.any(String) } });

    const badLang = buildEntry(books, 'x', form(books, { title: 'T', author: 'A', status: 'queued', languages: 'DE' }));
    expect(badLang).toMatchObject({ ok: false, errors: { languages: expect.not.stringMatching(/^0:/) } });
  });

  it('keeps commas inside free-text list items by splitting on lines only', () => {
    const languages = collectionSpec('languages')!;
    const result = buildEntry(
      languages,
      'german',
      form(languages, {
        name: 'German',
        level: 'B1',
        target: 'B2',
        since: '2024-01',
        methods: 'Anki, 20 new cards a day\nTutor twice a week',
      }),
    );
    expect(result.ok && matter(result.text).data.methods).toEqual(['Anki, 20 new cards a day', 'Tutor twice a week']);
  });

  it('rejects bad slugs and bad numbers', () => {
    const ok = { title: 'T', author: 'A', status: 'queued', languages: 'EN' };
    expect(buildEntry(books, 'Bad Slug', form(books, ok))).toMatchObject({ ok: false, errors: { slug: expect.any(String) } });
    expect(buildEntry(books, '../x', form(books, ok)).ok).toBe(false);
    expect(buildEntry(books, 'x', form(books, { ...ok, rating: 'five' })).ok).toBe(false);
  });

  it('reports invalid YAML in nested fields', () => {
    const travel = collectionSpec('travel')!;
    const result = buildEntry(
      travel,
      'x',
      form(travel, { title: 'T', country: 'C', countryCode: 'JP', start: '2025-04', cities: '- { name: [' }),
    );
    expect(result).toMatchObject({ ok: false, errors: { cities: expect.stringContaining('YAML') } });
  });

  it('writes the body after the frontmatter', () => {
    const hobbies = collectionSpec('hobbies')!;
    const result = buildEntry(
      hobbies,
      'chess',
      form(hobbies, { name: 'Chess', description: 'd', state: 'active', since: '2020-01' }, 'Some notes.\r\n'),
    );
    expect(result.ok && result.text.endsWith('---\n\nSome notes.\n')).toBe(true);
  });

  it('quotes strings that the site loader would misread as other types', () => {
    const sport = collectionSpec('sport')!;
    const result = buildEntry(
      sport,
      'running',
      form(sport, {
        name: 'Running',
        unit: 'km',
        weekly: '[1, 2]',
        records: '- { label: 10k, value: "44:12", date: "2026-05" }',
        events: '- { name: Race, date: "2026-05-16", result: "yes" }',
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const read = matter(result.text).data;
    expect(read.records[0]).toEqual({ label: '10k', value: '44:12', date: '2026-05' });
    expect(read.events[0].result).toBe('yes');
  });
});

describe('dump', () => {
  it('uses flow style for nested lists and keeps scalars plain', () => {
    expect(dump({ weekly: [1, 2, 3], cities: [{ name: 'A', lat: 1, lng: 2 }], title: 'Plain' })).toBe(
      'weekly: [ 1, 2, 3 ]\ncities:\n  - { name: A, lat: 1, lng: 2 }\ntitle: Plain\n',
    );
  });
});

describe('every real content file', () => {
  const root = path.join(process.cwd(), 'content');
  for (const spec of COLLECTIONS) {
    for (const name of fs.readdirSync(path.join(root, spec.key)).filter((n) => n.endsWith('.md'))) {
      it(`${spec.key}/${name} survives file -> form -> file unchanged`, () => {
        const text = fs.readFileSync(path.join(root, spec.key, name), 'utf8');
        const original = matter(text);
        const rebuilt = buildEntry(spec, name.replace(/\.md$/, ''), parseEntry(spec, text));
        expect(rebuilt.ok).toBe(true);
        if (!rebuilt.ok) return;
        const again = matter(rebuilt.text);
        expect(JSON.parse(JSON.stringify(again.data))).toEqual(JSON.parse(JSON.stringify(original.data)));
        expect(again.content.trim()).toBe(original.content.trim());
      });
    }
  }
});

describe('entryTitle', () => {
  it('reads the title of a file, and survives garbage', () => {
    expect(entryTitle(books, '---\ntitle: Hello\n---\n')).toBe('Hello');
    expect(entryTitle(books, '---\n: : [\n---\n')).toBe('(unreadable)');
  });
});
