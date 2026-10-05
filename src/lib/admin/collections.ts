import type { z } from 'zod';
import {
  BOOK_LANGUAGES,
  CEFR,
  bookSchema,
  careerSchema,
  hobbySchema,
  languageSchema,
  sportSchema,
  tripSchema,
} from '@/lib/content/schemas';

// How each collection is edited. `kind` decides the input: scalars are plain inputs, `multi` is a
// set of checkboxes, `bool` is yes / no / default, and `yaml` is a text area for nested data
// (cities, records, events). Field order is the key order written to the file.
export type FieldKind = 'text' | 'number' | 'select' | 'multi' | 'tags' | 'month' | 'bool' | 'yaml';

export interface Field {
  name: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  options?: readonly string[];
  hint?: string;
}

export interface CollectionSpec {
  /** URL segment under /admin and the directory under content/. */
  key: string;
  label: string;
  singular: string;
  schema: z.ZodType<object>;
  fields: Field[];
  titleOf: (data: Record<string, unknown>) => string;
}

const sample: Field = { name: 'sample', label: 'Placeholder entry', kind: 'bool', hint: 'shows a "sample" tag' };

const str = (v: unknown) => (typeof v === 'string' ? v : '');

export const COLLECTIONS: CollectionSpec[] = [
  {
    key: 'books',
    label: 'books',
    singular: 'book',
    schema: bookSchema,
    titleOf: (d) => str(d.title),
    fields: [
      { name: 'title', label: 'Title (English, or catalog translation)', kind: 'text', required: true },
      { name: 'readTitle', label: 'Title on the copy I read', kind: 'text' },
      { name: 'titleIsTranslation', label: 'Title is my own translation', kind: 'bool' },
      { name: 'author', label: 'Author', kind: 'text', required: true },
      {
        name: 'status',
        label: 'Status',
        kind: 'select',
        required: true,
        options: ['reading', 'paused', 'finished', 'queued'],
      },
      { name: 'progress', label: 'Progress (0-100)', kind: 'number', hint: 'required for reading and paused' },
      { name: 'started', label: 'Started', kind: 'month', hint: 'YYYY-MM' },
      { name: 'finished', label: 'Finished', kind: 'month', hint: 'YYYY-MM' },
      { name: 'rating', label: 'Rating (1-5)', kind: 'number' },
      { name: 'published', label: 'Year published', kind: 'number' },
      { name: 'languages', label: 'Language I read it in', kind: 'multi', required: true, options: BOOK_LANGUAGES },
      { name: 'tags', label: 'Tags', kind: 'tags', hint: 'one per line' },
      sample,
    ],
  },
  {
    key: 'travel',
    label: 'travel',
    singular: 'trip',
    schema: tripSchema,
    titleOf: (d) => str(d.title),
    fields: [
      { name: 'title', label: 'Title', kind: 'text', required: true },
      { name: 'country', label: 'Country', kind: 'text', required: true },
      { name: 'countryCode', label: 'Country code', kind: 'text', required: true, hint: 'two letters, like JP' },
      { name: 'start', label: 'Start', kind: 'month', required: true, hint: 'YYYY-MM' },
      { name: 'days', label: 'Days', kind: 'number' },
      {
        name: 'cities',
        label: 'Cities',
        kind: 'yaml',
        required: true,
        hint: 'one per line: - { name: Tokyo, lat: 35.6762, lng: 139.6503 }',
      },
      sample,
    ],
  },
  {
    key: 'languages',
    label: 'languages',
    singular: 'language',
    schema: languageSchema,
    titleOf: (d) => str(d.name),
    fields: [
      { name: 'name', label: 'Language', kind: 'text', required: true },
      { name: 'level', label: 'Level now', kind: 'select', required: true, options: CEFR },
      { name: 'target', label: 'Target level', kind: 'select', required: true, options: CEFR },
      { name: 'since', label: 'Since', kind: 'month', required: true, hint: 'YYYY-MM' },
      { name: 'methods', label: 'Methods', kind: 'tags', hint: 'one per line' },
      { name: 'streakDays', label: 'Streak (days)', kind: 'number' },
      sample,
    ],
  },
  {
    key: 'sport',
    label: 'sport',
    singular: 'sport',
    schema: sportSchema,
    titleOf: (d) => str(d.name),
    fields: [
      { name: 'name', label: 'Sport', kind: 'text', required: true },
      { name: 'unit', label: 'Unit', kind: 'text', required: true, hint: 'km, h, sessions' },
      { name: 'weekly', label: 'Weekly totals', kind: 'yaml', required: true, hint: '2 to 52 numbers, oldest first: [18, 22, 20]' },
      { name: 'streakDays', label: 'Streak (days)', kind: 'number' },
      { name: 'records', label: 'Records', kind: 'yaml', hint: '- { label: 10k, value: "44:12", date: "2026-05" }' },
      { name: 'events', label: 'Events', kind: 'yaml', hint: '- { name: Marathon, date: "2027-04-18", result: "3:59" }' },
      { name: 'active', label: 'Active', kind: 'bool' },
      sample,
    ],
  },
  {
    key: 'hobbies',
    label: 'hobbies',
    singular: 'hobby',
    schema: hobbySchema,
    titleOf: (d) => str(d.name),
    fields: [
      { name: 'name', label: 'Hobby', kind: 'text', required: true },
      { name: 'description', label: 'Description', kind: 'text', required: true },
      { name: 'state', label: 'State', kind: 'select', required: true, options: ['active', 'inactive'] },
      { name: 'since', label: 'Since', kind: 'month', required: true, hint: 'when it entered that state, YYYY-MM' },
      sample,
    ],
  },
  {
    key: 'career',
    label: 'career',
    singular: 'job',
    schema: careerSchema,
    titleOf: (d) => `${str(d.role)} at ${str(d.company)}`,
    fields: [
      { name: 'company', label: 'Company', kind: 'text', required: true },
      { name: 'role', label: 'Role', kind: 'text', required: true },
      { name: 'start', label: 'Start', kind: 'month', required: true, hint: 'YYYY-MM' },
      { name: 'end', label: 'End', kind: 'month', hint: 'YYYY-MM, empty if current' },
      sample,
    ],
  },
];

export function collectionSpec(key: string): CollectionSpec | undefined {
  return COLLECTIONS.find((c) => c.key === key);
}

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// The serializable part of a spec, for client components (the zod schema stays on the server).
export interface PublicSpec {
  key: string;
  singular: string;
  fields: Field[];
}

export function publicSpec(spec: CollectionSpec): PublicSpec {
  return { key: spec.key, singular: spec.singular, fields: spec.fields };
}
