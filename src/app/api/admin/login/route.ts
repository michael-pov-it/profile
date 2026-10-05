import { adminApi } from '@/lib/admin/api';
import { login } from '@/lib/admin/handlers';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return adminApi(request, { auth: false, limit: 10 }, login);
}
