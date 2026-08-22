import { isAdmin, json, securityConfigured } from '../../../server/security';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const configured = securityConfigured();
  return json({ configured, authenticated: configured ? await isAdmin(request) : false });
}
