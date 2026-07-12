/**
 * IPC bridge for the "Import from AMZ IPTV" flow (iptv.tutoje.cz).
 *
 * The resolve request runs in the main process on purpose: the AMZ API only
 * sends CORS headers for a single allow-listed web origin, so a renderer
 * `fetch` would be blocked in the packaged Electron app. Node-side requests
 * are not subject to CORS.
 *
 * The self-issued API key is a one-time bootstrap per install: registered on
 * first use, persisted in the app config store, and only re-registered when
 * the server answers 401 (expired/revoked key).
 */
import axios from 'axios';
import { app, ipcMain } from 'electron';
import {
    AMZ_IMPORT_REGISTER_KEY_URL,
    AMZ_IMPORT_RESOLVE,
    AMZ_IMPORT_RESOLVE_URL,
    AmzImportResult,
    extractAmzImportHash,
    mapAmzImportResponse,
} from '@iptvnator/shared/interfaces';
import { AMZ_IMPORT_API_KEY, store } from '../services/store.service';

const REQUEST_TIMEOUT_MS = 15_000;

export default class AmzImportEvents {
    static bootstrapAmzImportEvents(): Electron.IpcMain {
        return ipcMain;
    }
}

async function registerApiKey(): Promise<string | null> {
    try {
        const response = await axios.post(
            AMZ_IMPORT_REGISTER_KEY_URL,
            { label: `iptvnator-electron ${app.getVersion()}` },
            { timeout: REQUEST_TIMEOUT_MS, validateStatus: () => true }
        );
        const apiKey = (response.data as { api_key?: unknown })?.api_key;
        if (response.status === 200 && typeof apiKey === 'string' && apiKey) {
            store.set(AMZ_IMPORT_API_KEY, apiKey);
            return apiKey;
        }
        console.error(
            '[AmzImport] Key registration failed with status',
            response.status
        );
        return null;
    } catch (error) {
        console.error('[AmzImport] Key registration request failed:', error);
        return null;
    }
}

async function resolveHash(
    hash: string,
    apiKey: string
): Promise<AmzImportResult> {
    try {
        const response = await axios.get(
            `${AMZ_IMPORT_RESOLVE_URL}/${hash}`,
            {
                headers: { 'X-Api-Key': apiKey },
                timeout: REQUEST_TIMEOUT_MS,
                validateStatus: () => true,
            }
        );
        return mapAmzImportResponse(response.status, response.data);
    } catch (error) {
        console.error('[AmzImport] Resolve request failed:', error);
        return { ok: false, error: 'network' };
    }
}

ipcMain.handle(
    AMZ_IMPORT_RESOLVE,
    async (_event, input: string): Promise<AmzImportResult> => {
        const hash = extractAmzImportHash(input);
        if (!hash) {
            return { ok: false, error: 'invalid_input' };
        }

        let apiKey = store.get(AMZ_IMPORT_API_KEY) as string | undefined;
        if (!apiKey) {
            apiKey = (await registerApiKey()) ?? undefined;
            if (!apiKey) {
                return { ok: false, error: 'network' };
            }
        }

        let result = await resolveHash(hash, apiKey);

        // 401 means the stored key expired or was revoked server-side —
        // re-register once and retry rather than surfacing the auth error.
        if (result.ok === false && result.error === 'auth') {
            const freshKey = await registerApiKey();
            if (!freshKey) {
                return { ok: false, error: 'network' };
            }
            result = await resolveHash(hash, freshKey);
        }

        return result;
    }
);
