'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import type { Field, PublicSpec } from '@/lib/admin/collections';
import { api, slugify } from './api';

interface Props {
  spec: PublicSpec;
  /** Set when editing; absent when creating. */
  slug?: string;
  sha?: string;
  initial: { values: Record<string, string>; body: string };
}

const BOOL_OPTIONS: [string, string][] = [
  ['', 'default'],
  ['true', 'yes'],
  ['false', 'no'],
];

export function EntryEditor({ spec, slug: existingSlug, sha, initial }: Props) {
  const router = useRouter();
  const editing = existingSlug !== undefined;
  const [values, setValues] = useState(initial.values);
  const [body, setBody] = useState(initial.body);
  const [slug, setSlug] = useState(existingSlug ?? '');
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const titleField = spec.fields.find((f) => f.kind === 'text');

  function set(name: string, value: string) {
    setValues((v) => ({ ...v, [name]: value }));
    if (!editing && !slugTouched && name === titleField?.name) setSlug(slugify(value));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setErrors({});
    setMessage('');
    const res = await api(`/api/admin/content/${spec.key}/${encodeURIComponent(slug)}`, 'PUT', { values, body, sha });
    if (res.ok) {
      router.push(`/admin/${spec.key}?saved=${encodeURIComponent(slug)}`);
      router.refresh();
      return;
    }
    setErrors(res.data.errors ?? {});
    setMessage(res.data.errors ? 'Fix the highlighted fields and save again.' : (res.data.error ?? 'could not save'));
    setBusy(false);
  }

  async function onDelete() {
    if (!window.confirm(`Delete ${spec.singular} "${slug}"? This removes the file from git.`)) return;
    setBusy(true);
    const res = await api(`/api/admin/content/${spec.key}/${encodeURIComponent(slug)}`, 'DELETE', { sha });
    if (res.ok) {
      router.push(`/admin/${spec.key}?deleted=${encodeURIComponent(slug)}`);
      router.refresh();
      return;
    }
    setMessage(res.data.error ?? 'could not delete');
    setBusy(false);
  }

  function renderInput(field: Field) {
    const id = `f-${field.name}`;
    const common = {
      id,
      name: field.name,
      className: 'input',
      'aria-invalid': errors[field.name] ? true : undefined,
      'aria-describedby': `${id}-help`,
    };
    const value = values[field.name] ?? '';

    switch (field.kind) {
      case 'select':
        return (
          <select {...common} value={value} onChange={(e) => set(field.name, e.target.value)}>
            <option value="">{field.required ? 'choose...' : 'none'}</option>
            {field.options?.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        );
      case 'bool':
        return (
          <select {...common} value={value} onChange={(e) => set(field.name, e.target.value)}>
            {BOOL_OPTIONS.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        );
      case 'multi': {
        const chosen = value.split(',').map((s) => s.trim()).filter(Boolean);
        return (
          <div id={id} role="group" aria-describedby={`${id}-help`} className="flex flex-wrap gap-x-[3ch] gap-y-2">
            {field.options?.map((o) => (
              <label key={o} className="flex items-center gap-[1ch]">
                <input
                  type="checkbox"
                  checked={chosen.includes(o)}
                  onChange={(e) =>
                    set(
                      field.name,
                      (e.target.checked ? [...chosen, o] : chosen.filter((c) => c !== o))
                        .sort((a, b) => (field.options?.indexOf(a) ?? 0) - (field.options?.indexOf(b) ?? 0))
                        .join(','),
                    )
                  }
                />
                {o}
              </label>
            ))}
          </div>
        );
      }
      case 'tags':
        return <textarea {...common} rows={3} value={value} onChange={(e) => set(field.name, e.target.value)} />;
      case 'yaml':
        return (
          <textarea
            {...common}
            rows={5}
            spellCheck={false}
            value={value}
            onChange={(e) => set(field.name, e.target.value)}
          />
        );
      case 'number':
        return <input {...common} inputMode="decimal" value={value} onChange={(e) => set(field.name, e.target.value)} />;
      case 'month':
        return (
          <input {...common} placeholder="YYYY-MM" value={value} onChange={(e) => set(field.name, e.target.value)} />
        );
      default:
        return <input {...common} value={value} onChange={(e) => set(field.name, e.target.value)} />;
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-[78ch] space-y-5" noValidate>
      <div className="field">
        <label htmlFor="slug" className="field-label">
          File name (the page address)
        </label>
        <input
          id="slug"
          className="input"
          value={slug}
          readOnly={editing}
          onChange={(e) => {
            setSlug(e.target.value);
            setSlugTouched(true);
          }}
          aria-invalid={errors.slug ? true : undefined}
          aria-describedby="slug-help"
        />
        <p id="slug-help" className="field-hint">
          {errors.slug ? <span className="field-error">{errors.slug}</span> : 'lowercase words joined by hyphens; cannot change later'}
        </p>
      </div>

      {spec.fields.map((field) => (
        <div key={field.name} className="field">
          <label htmlFor={`f-${field.name}`} className="field-label">
            {field.label}
            {field.required && <span className="text-warn"> *</span>}
          </label>
          {renderInput(field)}
          <p id={`f-${field.name}-help`} className="field-hint">
            {errors[field.name] ? <span className="field-error">{errors[field.name]}</span> : field.hint}
          </p>
        </div>
      ))}

      <div className="field">
        <label htmlFor="body" className="field-label">
          Notes (Markdown, use ### for headings)
        </label>
        <textarea id="body" className="input" rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
      </div>

      {errors._ && <p className="field-error">{errors._}</p>}
      {message && (
        <p role="alert" className="notice notice-error">
          {message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-[3ch]">
        <button type="submit" className="btn" disabled={busy}>
          {editing ? 'Save changes' : `Add ${spec.singular}`}
        </button>
        {editing && (
          <button type="button" className="btn btn-danger" onClick={onDelete} disabled={busy}>
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
