/**
 * Shared contract for the "Import from AMZ IPTV" flow (iptv.tutoje.cz).
 *
 * A share hash (32 lowercase hex chars, optionally wrapped in a
 * `?data=<hash>` share URL) resolves through the AMZ IPTV API into a full
 * Xtream Codes or Stalker portal account. The pure helpers here are used by
 * both the Electron main process (axios) and the PWA renderer (fetch) so the
 * two paths cannot drift apart in parsing or error mapping.
 */

export const AMZ_IPTV_BASE_URL = 'https://iptv.tutoje.cz';
export const AMZ_IMPORT_REGISTER_KEY_URL = `${AMZ_IPTV_BASE_URL}/api/import-key/register`;
export const AMZ_IMPORT_RESOLVE_URL = `${AMZ_IPTV_BASE_URL}/api/import`;

export type AmzImportAccount =
    | {
          type: 'xtream';
          server: string;
          username: string;
          password: string;
      }
    | {
          type: 'stalker';
          server: string;
          mac: string;
      };

export type AmzImportErrorCode =
    | 'invalid_input'
    | 'not_found'
    | 'expired'
    | 'rate_limited'
    | 'auth'
    | 'network';

export type AmzImportResult =
    | { ok: true; account: AmzImportAccount }
    | { ok: false; error: AmzImportErrorCode; reason?: string };

/**
 * Extracts the 32-hex-char share hash from either a bare hash or a full
 * share URL (`https://iptv.tutoje.cz/?data=<hash>`). Returns the lowercase
 * hash, or null when the input contains none.
 */
export function extractAmzImportHash(input: string): string | null {
    const match = /(?:data=)?([a-f0-9]{32})/i.exec(input ?? '');
    return match ? match[1].toLowerCase() : null;
}

/**
 * Maps an HTTP response from `GET /api/import/{hash}` to the shared result
 * type. A 401 maps to 'auth' so callers can re-register the API key once and
 * retry; every other non-success status maps to a stable error code.
 */
export function mapAmzImportResponse(
    status: number,
    body: unknown
): AmzImportResult {
    if (status === 200) {
        const account = parseAmzImportAccount(body);
        return account
            ? { ok: true, account }
            : { ok: false, error: 'network', reason: 'malformed_response' };
    }
    const reason =
        typeof (body as { reason?: unknown })?.reason === 'string'
            ? ((body as { reason: string }).reason as string)
            : undefined;
    switch (status) {
        case 401:
            return { ok: false, error: 'auth' };
        case 404:
            return { ok: false, error: 'not_found' };
        case 410:
            return { ok: false, error: 'expired', reason };
        case 429:
            return { ok: false, error: 'rate_limited' };
        default:
            return { ok: false, error: 'network', reason: `http_${status}` };
    }
}

function parseAmzImportAccount(body: unknown): AmzImportAccount | null {
    if (!body || typeof body !== 'object') {
        return null;
    }
    const record = body as Record<string, unknown>;
    if (
        record['type'] === 'xtream' &&
        typeof record['server'] === 'string' &&
        typeof record['username'] === 'string' &&
        typeof record['password'] === 'string'
    ) {
        return {
            type: 'xtream',
            server: record['server'],
            username: record['username'],
            password: record['password'],
        };
    }
    if (
        record['type'] === 'stalker' &&
        typeof record['server'] === 'string' &&
        typeof record['mac'] === 'string'
    ) {
        return {
            type: 'stalker',
            server: record['server'],
            mac: record['mac'],
        };
    }
    return null;
}
