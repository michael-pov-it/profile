import { type CollectionSpec } from './collections';
import { entryTitle } from './entry';
import type { ContentRepo } from './repo';

export interface ListedEntry {
  slug: string;
  title: string;
}

// One request per file on GitHub, which is fine for a personal site's few dozen entries.
export async function listEntries(repo: ContentRepo, spec: CollectionSpec): Promise<ListedEntry[]> {
  const entries = await repo.list(spec.key);
  return Promise.all(
    entries.map(async ({ slug }) => {
      const file = await repo.read(`${spec.key}/${slug}.md`);
      return { slug, title: file ? entryTitle(spec, file.text) : '(missing)' };
    }),
  );
}
