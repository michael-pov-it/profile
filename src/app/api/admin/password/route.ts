import { adminApi } from '@/lib/admin/api';
import { changePassword } from '@/lib/admin/handlers';

export const dynamic = 'force-dynamic';

export function PUT(request: Request) {
  return adminApi(request, { auth: true }, changePassword);
}
