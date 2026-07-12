import {
    extractAmzImportHash,
    mapAmzImportResponse,
} from './amz-import.interface';

const HASH = '3858f62230ac3c915f300c664312c631';

describe('extractAmzImportHash', () => {
    it('accepts a bare 32-hex hash', () => {
        expect(extractAmzImportHash(HASH)).toBe(HASH);
    });

    it('accepts a full share URL', () => {
        expect(
            extractAmzImportHash(`https://iptv.tutoje.cz/?data=${HASH}`)
        ).toBe(HASH);
    });

    it('lowercases uppercase input', () => {
        expect(extractAmzImportHash(HASH.toUpperCase())).toBe(HASH);
    });

    it('tolerates surrounding whitespace', () => {
        expect(extractAmzImportHash(`  ${HASH}\n`)).toBe(HASH);
    });

    it('rejects input without a 32-hex hash', () => {
        expect(extractAmzImportHash('not-a-hash')).toBeNull();
        expect(extractAmzImportHash('')).toBeNull();
        expect(extractAmzImportHash('data=12345')).toBeNull();
    });
});

describe('mapAmzImportResponse', () => {
    it('maps a valid xtream payload', () => {
        expect(
            mapAmzImportResponse(200, {
                type: 'xtream',
                server: 'http://provider.example:8080',
                username: 'foo123',
                password: 'bar456',
            })
        ).toEqual({
            ok: true,
            account: {
                type: 'xtream',
                server: 'http://provider.example:8080',
                username: 'foo123',
                password: 'bar456',
            },
        });
    });

    it('maps a valid stalker payload', () => {
        expect(
            mapAmzImportResponse(200, {
                type: 'stalker',
                server: 'http://provider.example:8080',
                mac: '00:1A:79:12:34:56',
            })
        ).toEqual({
            ok: true,
            account: {
                type: 'stalker',
                server: 'http://provider.example:8080',
                mac: '00:1A:79:12:34:56',
            },
        });
    });

    it('rejects malformed 200 payloads', () => {
        expect(mapAmzImportResponse(200, { type: 'xtream' })).toEqual({
            ok: false,
            error: 'network',
            reason: 'malformed_response',
        });
        expect(mapAmzImportResponse(200, null)).toEqual({
            ok: false,
            error: 'network',
            reason: 'malformed_response',
        });
    });

    it('maps error statuses to stable codes', () => {
        expect(mapAmzImportResponse(404, { error: 'not_found' })).toEqual({
            ok: false,
            error: 'not_found',
        });
        expect(
            mapAmzImportResponse(410, { error: 'expired', reason: 'unpaid' })
        ).toEqual({ ok: false, error: 'expired', reason: 'unpaid' });
        expect(mapAmzImportResponse(429, { error: 'rate_limited' })).toEqual({
            ok: false,
            error: 'rate_limited',
        });
        expect(mapAmzImportResponse(401, {})).toEqual({
            ok: false,
            error: 'auth',
        });
        expect(mapAmzImportResponse(500, {})).toEqual({
            ok: false,
            error: 'network',
            reason: 'http_500',
        });
    });
});
