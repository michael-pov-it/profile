import { adminApi } from '@/lib/admin/api';
import { publish, publishStatus } from '@/lib/admin/handlers';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return adminApi(request, { auth: true }, publishStatus);
}

export function POST(request: Request) {
  return adminApi(request, { auth: true }, publish);
}
