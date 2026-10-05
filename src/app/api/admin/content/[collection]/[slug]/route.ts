import { adminApi } from '@/lib/admin/api';
import { contentDelete, contentGet, contentSave } from '@/lib/admin/handlers';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ collection: string; slug: string }> };

export async function GET(request: Request, { params }: Params) {
  const { collection, slug } = await params;
  return adminApi(request, { auth: true }, (ctx) => contentGet(ctx, collection, slug));
}

export async function PUT(request: Request, { params }: Params) {
  const { collection, slug } = await params;
  return adminApi(request, { auth: true }, (ctx) => contentSave(ctx, collection, slug));
}

export async function DELETE(request: Request, { params }: Params) {
  const { collection, slug } = await params;
  return adminApi(request, { auth: true }, (ctx) => contentDelete(ctx, collection, slug));
}
