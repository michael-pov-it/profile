export interface Tab {
  key: string;
  href: string;
  label: string;
}

export const TABS: readonly Tab[] = [
  { key: '0', href: '/', label: '~' },
  { key: '1', href: '/setup', label: 'setup' },
  { key: '2', href: '/hobbies', label: 'hobbies' },
  { key: '3', href: '/languages', label: 'languages' },
  { key: '4', href: '/sport', label: 'sport' },
  { key: '5', href: '/travel', label: 'travel' },
  { key: '6', href: '/books', label: 'books' },
];

export function activeTabHref(pathname: string): string | undefined {
  if (pathname === '/') return '/';
  const section = `/${pathname.split('/')[1]}`;
  return TABS.find((t) => t.href !== '/' && t.href === section)?.href;
}

export function promptPath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '~' : `~${trimmed}`;
}
