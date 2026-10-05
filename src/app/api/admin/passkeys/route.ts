import { adminApi } from '@/lib/admin/api';
import { passkeyDelete } from '@/lib/admin/handlers';

export const dynamic = 'force-dynamic';

export function DELETE(request: Request) {
  return adminApi(request, { auth: true }, passkeyDelete);
}
