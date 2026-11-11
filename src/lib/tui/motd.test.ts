import { describe, expect, it } from 'vitest';
import type { Book, Hobby, Language, Machine, Sport, Trip } from '@/lib/content/collections';
import { summarize } from './motd';

describe('summarize', () => {
  it('summarizes every section', () => {
    const books: Book[] = [
      { slug: 'a', title: 'A', author: 'x', languages: ['EN'], titleIsTranslation: false, status: 'reading', progress: 40, started: '2026-01', tags: [], sample: false, body: '' },
      { slug: 'b', title: 'B', author: 'x', languages: ['EN'], titleIsTranslation: false, status: 'reading', progress: 10, started: '2026-08', tags: [], sample: true, body: '' },
      { slug: 'c', title: 'C', author: 'x', languages: ['EN'], titleIsTranslation: false, status: 'finished', finished: '2025-01', tags: [], sample: false, body: '' },
    ];
    const trips: Trip[] = [
      { slug: 't1', title: 'T1', country: 'Japan', countryCode: 'JP', start: '2025-04', cities: [{ name: 'Tokyo', lat: 35.7, lng: 139.7 }], sample: false, body: '' },
      { slug: 't2', title: 'T2', country: 'Iceland', countryCode: 'IS', start: '2026-06', cities: [{ name: 'Reykjavík', lat: 64.1, lng: -21.9 }], sample: true, body: '' },
    ];
    const languages: Language[] = [
      { slug: 'de', name: 'German', native: false, level: 'B1', target: 'B2', since: '2024-01', methods: [], sample: false, body: '' },
      { slug: 'en', name: 'English', native: false, level: 'C1', target: 'C1', since: '2010', methods: [], sample: false, body: '' },
    ];
    const sports: Sport[] = [
      { slug: 'run', name: 'Running', unit: 'km', weekly: [1, 2], records: [], events: [], streakDays: 41, active: true, sample: true, body: '' },
      { slug: 'climb', name: 'Climbing', unit: 'sessions', weekly: [1, 2], records: [], events: [], streakDays: 90, active: false, sample: false, body: '' },
    ];
    const hobbies: Hobby[] = [
      { slug: 'chess', name: 'Chess', description: 'd', state: 'inactive', since: '2022-03', sample: false, body: '' },
      { slug: 'photo', name: 'Photography', description: 'd', state: 'active', since: '2019-06', sample: false, body: '' },
    ];

    const machines: Machine[] = [
      { slug: 'workpc', name: 'workpc', group: 'work', order: 1, rows: [{ label: 'net', value: 'wired 1 Gbps, 923 down / 300 up' }], sample: false, body: '' },
      { slug: 'laptop', name: 'laptop', group: 'home', order: 3, rows: [{ label: 'cpu', value: 'c' }], sample: true, body: '' },
    ];

    expect(summarize({ books, trips, languages, sports, hobbies, machines })).toEqual({
      machines: 2,
      connection: 'wired 1 Gbps',
      reading: 2,
      nowReading: { title: 'B', progress: 10, slug: 'b', sample: true },
      countries: 2,
      lastTrip: { host: 'reykjavik.is', start: '2026-06', slug: 't2', sample: true },
      languagesRunning: 1,
      languagesTotal: 2,
      streak: { sport: 'Running', days: 41, sample: true },
      hobbiesActive: 1,
      hobbiesTotal: 2,
      samples: { books: true, trips: true, languages: false, sports: true, hobbies: false, machines: true },
    });
  });

  it('handles empty sections without inventing values', () => {
    expect(summarize({ books: [], trips: [], languages: [], sports: [], hobbies: [], machines: [] })).toEqual({
      machines: 0,
      connection: undefined,
      reading: 0,
      nowReading: undefined,
      countries: 0,
      lastTrip: undefined,
      languagesRunning: 0,
      languagesTotal: 0,
      streak: undefined,
      hobbiesActive: 0,
      hobbiesTotal: 0,
      samples: { books: false, trips: false, languages: false, sports: false, hobbies: false, machines: false },
    });
  });

  it('counts a machine with no net row and gives no connection', () => {
    const machines: Machine[] = [
      { slug: 'laptop', name: 'laptop', group: 'home', rows: [{ label: 'cpu', value: 'c' }], sample: false, body: '' },
    ];
    const summary = summarize({ books: [], trips: [], languages: [], sports: [], hobbies: [], machines });
    expect(summary.machines).toBe(1);
    expect(summary.connection).toBeUndefined();
  });
});
