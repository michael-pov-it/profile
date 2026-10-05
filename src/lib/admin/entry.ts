import matter from 'gray-matter';
import YAML from 'yaml';
import { z } from 'zod';
import { type CollectionSpec, type Field, SLUG_PATTERN } from './collections';

// An entry as the form sees it: every field is a string, in the shape its input produces.
export interface EntryForm {
  values: Record<string, string>;
  body: string;
}

export type FieldErrors = Record<string, string>;

export type BuildResult =
  | { ok: true; text: string; data: Record<string, unknown> }
  | { ok: false; errors: FieldErrors };

// Written as YAML 1.1 so strings the site's loader (js-yaml 3) would misread, like 44:12, yes or
// 2026-08-12, come out quoted. Nested lists are flow style, matching the hand-written files.
export function dump(data: unknown): string {
  const doc = new YAML.Document(data, { version: '1.1' });
  YAML.visit(doc, {
    Seq(_, seq, path) {
      if (seq.items.every(YAML.isScalar) || path.some(YAML.isSeq)) seq.flow = true;
    },
    Map(_, map, path) {
      if (path.some(YAML.isSeq)) map.flow = true;
    },
  });
  return doc.toString({ lineWidth: 0 });
}

function toValue(field: Field, raw: string): { value?: unknown; error?: string } {
  const text = raw.trim();
  if (text === '') return {};
  switch (field.kind) {
    case 'number':
      return { value: Number.isFinite(Number(text)) ? Number(text) : text };
    case 'bool':
      return { value: text === 'true' ? true : text === 'false' ? false : text };
    case 'multi':
      return { value: text.split(',').map((t) => t.trim()).filter(Boolean) };
    case 'tags':
      // One per line: free-text items such as "Anki, 20 new cards a day" may contain commas.
      return { value: text.split(/\r?\n/).map((t) => t.trim()).filter(Boolean) };
    case 'yaml':
      try {
        return { value: YAML.parse(text) };
      } catch (err) {
        return { error: `not valid YAML: ${(err as Error).message.split('\n')[0]}` };
      }
    default:
      return { value: text };
  }
}

function toText(field: Field, value: unknown): string {
  if (value === undefined || value === null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, field.kind === 'month' ? 7 : 10);
  switch (field.kind) {
    case 'multi':
      return Array.isArray(value) ? value.join(', ') : String(value);
    case 'tags':
      return Array.isArray(value) ? value.join('\n') : String(value);
    case 'yaml':
      return dump(value).trimEnd();
    default:
      return String(value);
  }
}

function issuesToErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '_');
    // A lone list index ("0: ...") means nothing to the reader; a deeper path ("1.lat: ...") does.
    const rest = issue.path.slice(1);
    const where = rest.length === 0 || (rest.length === 1 && typeof rest[0] === 'number') ? '' : `${rest.join('.')}: `;
    errors[key] ??= `${where}${issue.message}`;
  }
  return errors;
}

// Form -> file text. Validates with the same zod schema the build uses, and writes the values as
// typed (not the schema's output), so defaults such as `sample: false` do not get added to files.
export function buildEntry(spec: CollectionSpec, slug: string, form: EntryForm): BuildResult {
  const errors: FieldErrors = {};
  if (!SLUG_PATTERN.test(slug)) {
    errors.slug = 'use lowercase words joined by hyphens, like my-new-book';
  }

  const data: Record<string, unknown> = {};
  for (const field of spec.fields) {
    const { value, error } = toValue(field, form.values[field.name] ?? '');
    if (error) errors[field.name] = error;
    else if (value !== undefined) data[field.name] = value;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const body = form.body.replace(/\r\n/g, '\n').trim();
  const text = `---\n${dump(data)}---\n${body ? `\n${body}\n` : ''}`;

  // Validate what the build will actually read back, not what the form held.
  let reread: Record<string, unknown>;
  try {
    reread = matter(text).data;
  } catch (err) {
    return { ok: false, errors: { _: `could not be saved as valid YAML: ${(err as Error).message}` } };
  }
  const parsed = spec.schema.safeParse(reread);
  if (!parsed.success) return { ok: false, errors: issuesToErrors(parsed.error) };

  return { ok: true, data, text };
}

// File text -> form values, so an existing entry can be edited.
export function parseEntry(spec: CollectionSpec, text: string): EntryForm {
  const parsed = matter(text);
  const values: Record<string, string> = {};
  for (const field of spec.fields) values[field.name] = toText(field, parsed.data[field.name]);
  return { values, body: parsed.content.trim() };
}

export function emptyForm(spec: CollectionSpec): EntryForm {
  return { values: Object.fromEntries(spec.fields.map((f) => [f.name, ''])), body: '' };
}

export function entryTitle(spec: CollectionSpec, text: string): string {
  try {
    return spec.titleOf(matter(text).data) || '(untitled)';
  } catch {
    return '(unreadable)';
  }
}
