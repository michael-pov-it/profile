import { type NextRequest, NextResponse } from 'next/server';
import { adminConfig } from '@/lib/admin/config';
import { sessionCookieName, sessionIsValid } from '@/lib/admin/session';

// First, cheap gate for the admin pages: no valid session cookie means the login page. Pages and
// API routes check the session again against the account, so this is never the only protection.
// When admin is not configured the pages answer 404 themselves.
export function proxy(request: NextRequest) {
  const config = adminConfig();
  // Mirror the pages: production without a table store means admin is off, so no redirect either.
  if (!config || (config.production && !process.env.ADMIN_STORAGE_CONNECTION_STRING)) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (pathname === '/admin/login' || pathname === '/admin/setup') return NextResponse.next();

  if (!sessionIsValid(config, request.cookies.get(sessionCookieName(config))?.value)) {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ['/admin/:path*'] };
