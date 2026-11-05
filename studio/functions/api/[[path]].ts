/**
 * Cloudflare Pages Function: hands every /api/* request to the Studio API.
 * The Studio project's root directory is `studio/`, so Pages finds this file.
 */
import { handleApi } from '../../server/api.ts';
import type { StudioEnv } from '../../server/cloudflare.ts';

export function onRequest({ request, env }: { request: Request; env: StudioEnv }): Promise<Response> {
  return handleApi(request, env);
}
