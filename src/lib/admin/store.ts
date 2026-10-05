import fs from 'node:fs';
import path from 'node:path';
import { TableClient } from '@azure/data-tables';
import type { Account } from './account';

// One account, one record. `create` must be atomic and fail when an account already exists, so
// the setup page can never overwrite the real one.
export interface AdminStore {
  get(): Promise<Account | null>;
  create(account: Account): Promise<boolean>;
  save(account: Account): Promise<void>;
}

export async function updateAccount(store: AdminStore, change: (a: Account) => Account): Promise<Account | null> {
  const current = await store.get();
  if (!current) return null;
  const next = change(current);
  await store.save(next);
  return next;
}

export class MemoryStore implements AdminStore {
  private account: Account | null = null;
  async get() {
    return this.account && structuredClone(this.account);
  }
  async create(account: Account) {
    if (this.account) return false;
    this.account = structuredClone(account);
    return true;
  }
  async save(account: Account) {
    this.account = structuredClone(account);
  }
}

// Development only: a JSON file next to the project, ignored by git.
export class FileStore implements AdminStore {
  constructor(private file = path.join(process.cwd(), '.admin-dev', 'account.json')) {}
  async get() {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8')) as Account;
    } catch {
      return null;
    }
  }
  async create(account: Account) {
    if (fs.existsSync(this.file)) return false;
    await this.save(account);
    return true;
  }
  async save(account: Account) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(account, null, 2), { mode: 0o600 });
  }
}

const PARTITION = 'admin';
const ROW = 'account';

export class TableStore implements AdminStore {
  private table: TableClient;
  private ready: Promise<void>;

  constructor(connectionString: string, tableName = 'admin') {
    this.table = TableClient.fromConnectionString(connectionString, tableName);
    this.ready = this.table.createTable().catch(() => undefined);
  }

  async get() {
    await this.ready;
    try {
      const entity = await this.table.getEntity<{ data: string }>(PARTITION, ROW);
      return JSON.parse(entity.data) as Account;
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 404) return null;
      throw err;
    }
  }

  async create(account: Account) {
    await this.ready;
    try {
      await this.table.createEntity({ partitionKey: PARTITION, rowKey: ROW, data: JSON.stringify(account) });
      return true;
    } catch (err) {
      if ((err as { statusCode?: number }).statusCode === 409) return false;
      throw err;
    }
  }

  async save(account: Account) {
    await this.ready;
    await this.table.upsertEntity({ partitionKey: PARTITION, rowKey: ROW, data: JSON.stringify(account) }, 'Replace');
  }
}

export function storeFromEnv(env: Record<string, string | undefined> = process.env): AdminStore | null {
  if (env.ADMIN_STORAGE_CONNECTION_STRING) return new TableStore(env.ADMIN_STORAGE_CONNECTION_STRING);
  // The file store is for `npm run dev` only; production without a table means admin is off.
  return env.NODE_ENV === 'production' ? null : new FileStore();
}
