import { resolveRequestOwnerId } from './owner';
import { withCampusModelContext } from '@/lib/auth/campus-model-context';

/**
 * Resolve the anonymous owner identity and run a handler with its response
 * headers.
 *
 * The Set-Cookie minted by resolveRequestOwnerId must ride every response,
 * including 4xx and 5xx: a client that retries after an error keeps the same
 * owner partition, while a 500 that dropped the cookie would silently make
 * the retry a different anonymous owner.
 */
export async function withRequestOwnerId(
  req: Pick<Request, 'headers'>,
  handler: (ownerId: string, responseHeaders: Headers) => Promise<Response>,
): Promise<Response> {
  const responseHeaders = new Headers();
  const session = req.headers.get('cookie')?.includes('openmaic_campus_session=')
    ? await (await import('@/lib/auth/campus-auth')).getCampusSessionFromRequest(req)
    : null;
  const ownerId = resolveRequestOwnerId(req, responseHeaders, session?.userKey);
  try {
    if (session && (session.role === 'teacher' || session.role === 'student')) {
      const { getCampusModelSettings } = await import('@/lib/auth/campus-model-settings');
      const settings = await getCampusModelSettings(session.id);
      return await withCampusModelContext(
        { modelString: `${settings.providerId}:${settings.modelId}`, apiKey: settings.apiKey },
        () => handler(ownerId, responseHeaders),
      );
    }
    return await handler(ownerId, responseHeaders);
  } catch (error) {
    console.error('[agent-runtime] request failed under an owner', error);
    return new Response('Internal Server Error', { status: 500, headers: responseHeaders });
  }
}
