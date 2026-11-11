import { describe, expect, it } from 'vitest';
import { TABS, activeTabHref, promptPath } from './tabs';

describe('activeTabHref', () => {
  it('matches home only on the exact root', () => {
    expect(activeTabHref('/')).toBe('/');
  });

  it('matches a section and its detail pages', () => {
    expect(activeTabHref('/books')).toBe('/books');
    expect(activeTabHref('/books/atomic-habits')).toBe('/books');
  });

  it('matches the setup tab', () => {
    expect(activeTabHref('/setup')).toBe('/setup');
  });

  it('returns undefined for unknown paths', () => {
    expect(activeTabHref('/nope')).toBeUndefined();
  });
});

describe('promptPath', () => {
  it('shows the root as ~', () => {
    expect(promptPath('/')).toBe('~');
  });

  it('shows other paths under ~', () => {
    expect(promptPath('/travel/2025-04-japan')).toBe('~/travel/2025-04-japan');
  });

  it('drops a trailing slash', () => {
    expect(promptPath('/books/')).toBe('~/books');
  });
});

describe('TABS', () => {
  it('assigns keys 0-6 in order', () => {
    expect(TABS.map((t) => t.key).join('')).toBe('0123456');
  });

  it('lists the tabs in the agreed order', () => {
    expect(TABS.map((t) => t.href)).toEqual(['/', '/setup', '/hobbies', '/languages', '/sport', '/travel', '/books']);
  });
});
