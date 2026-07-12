import { Injectable } from '@angular/core';
import {
    AMZ_IMPORT_REGISTER_KEY_URL,
    AMZ_IMPORT_RESOLVE_URL,
    AmzImportResult,
    extractAmzImportHash,
    mapAmzImportResponse,
} from '@iptvnator/shared/interfaces';

/**
 * localStorage key for the PWA path. The Electron path stores its key in the
 * main-process config store instead (see amz-import.events.ts) because the
 * request itself must run in the main process to avoid CORS.
 */
const AMZ_IMPORT_API_KEY_STORAGE_KEY = 'amzImportApiKey';

/**
 * Resolves AMZ IPTV share hashes (iptv.tutoje.cz) into Xtream/Stalker
 * accounts. In Electron the whole flow (API-key bootstrap + resolve) is
 * delegated over IPC to the main process; in the PWA it runs via fetch and
 * requires the app's origin to be allow-listed server-side (CORS).
 *
 * The self-issued API key is a one-time bootstrap per install: registered
 * lazily on first use, persisted, and re-registered only when the server
 * answers 401 (expired/revoked key).
 */
@Injectable({ providedIn: 'root' })
export class AmzImportService {
    async resolve(input: string): Promise<AmzImportResult> {
        if (window.electron?.amzImportResolve) {
            return window.electron.amzImportResolve(input);
        }
        return this.resolveViaFetch(input);
    }

    private async resolveViaFetch(input: string): Promise<AmzImportResult> {
        const hash = extractAmzImportHash(input);
        if (!hash) {
            return { ok: false, error: 'invalid_input' };
        }

        let apiKey = localStorage.getItem(AMZ_IMPORT_API_KEY_STORAGE_KEY);
        if (!apiKey) {
            apiKey = await this.registerApiKey();
            if (!apiKey) {
                return { ok: false, error: 'network' };
            }
        }

        let result = await this.fetchHash(hash, apiKey);

        // 401 → stored key expired or was revoked; re-register once and retry.
        if (!result.ok && result.error === 'auth') {
            const freshKey = await this.registerApiKey();
            if (!freshKey) {
                return { ok: false, error: 'network' };
            }
            result = await this.fetchHash(hash, freshKey);
        }

        return result;
    }

    private async fetchHash(
        hash: string,
        apiKey: string
    ): Promise<AmzImportResult> {
        try {
            const response = await fetch(`${AMZ_IMPORT_RESOLVE_URL}/${hash}`, {
                headers: { 'X-Api-Key': apiKey },
            });
            const body = await response.json().catch(() => null);
            return mapAmzImportResponse(response.status, body);
        } catch (error) {
            console.error('[AmzImport] Resolve request failed:', error);
            return { ok: false, error: 'network' };
        }
    }

    private async registerApiKey(): Promise<string | null> {
        try {
            const response = await fetch(AMZ_IMPORT_REGISTER_KEY_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ label: 'iptvnator-pwa' }),
            });
            if (!response.ok) {
                console.error(
                    '[AmzImport] Key registration failed with status',
                    response.status
                );
                return null;
            }
            const body = (await response.json()) as { api_key?: unknown };
            if (typeof body.api_key === 'string' && body.api_key) {
                localStorage.setItem(
                    AMZ_IMPORT_API_KEY_STORAGE_KEY,
                    body.api_key
                );
                return body.api_key;
            }
            return null;
        } catch (error) {
            console.error(
                '[AmzImport] Key registration request failed:',
                error
            );
            return null;
        }
    }
}
