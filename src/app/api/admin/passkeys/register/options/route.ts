import { adminApi } from '@/lib/admin/api';
import { passkeyRegisterOptions } from '@/lib/admin/handlers';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return adminApi(request, { auth: true }, passkeyRegisterOptions);
}
