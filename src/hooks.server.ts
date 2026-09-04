import { CONTENT_SECURITY_POLICY } from "$lib/security/csp.js";

import type { Handle } from "@sveltejs/kit";

export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  response.headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  return response;
};
