import { adminApi } from '@/lib/admin/api';
import { revokeSessions } from '@/lib/admin/handlers';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return adminApi(request, { auth: true }, revokeSessions);
}
