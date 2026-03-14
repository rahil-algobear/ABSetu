import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Public paths that don't require authentication
const publicRoutes = [
  '/login/*',
  '/register/*',
  '/verify-otp/*',
];

// Define public file extensions that don't require authentication
const publicFileExtensions = [
  '.ico',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.css',
  '.js',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if the path is a public file
  if (publicFileExtensions.some((ext) => pathname.endsWith(ext))) {
    return NextResponse.next();
  }

  if (isStaticFile(pathname)) {
    return NextResponse.next();
  }

  // Check for authentication token
  const accessToken = request.cookies.get('access_token');
  const isPublicPath = isPublic(pathname);

  // Check if the path is a public route
  if (!accessToken && isPublicPath) {
    return NextResponse.next();
  }

  // If no token is found, redirect to login page
  if (!accessToken && !isPublicPath && pathname !== '/') {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // If token is found, allow the request to proceed
  return NextResponse.next();
}

function isPublic(path: string) {
  const isPublicRoute = publicRoutes.some((route) => {
    // Remove the /* from the route for comparison
    const baseRoute = route.replace('/*', '');
    // If route ends with /*, check if path starts with the base route
    return route.endsWith('/*') ? path.startsWith(baseRoute) : path === route;
  });

  return (
    isPublicRoute ||
    path.match(/\.[^/]+$/) || // allows any path with a file extension
    path.startsWith('/_next')
  );
}

function isStaticFile(path: string) {
  return path.match(/\.[^/]+$/);
}

// Configure which paths the proxy should run on
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
