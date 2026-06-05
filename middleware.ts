import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

const isSignInPage = createRouteMatcher(["/signin"]);

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  const authenticated = await convexAuth.isAuthenticated();

  // Unauthenticated visitors are pushed to the sign-in page.
  if (!isSignInPage(request) && !authenticated) {
    return nextjsMiddlewareRedirect(request, "/signin");
  }
  // Already signed in: keep them out of the sign-in page.
  if (isSignInPage(request) && authenticated) {
    return nextjsMiddlewareRedirect(request, "/");
  }
});

export const config = {
  // Run middleware on all routes except static files and Next internals.
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
