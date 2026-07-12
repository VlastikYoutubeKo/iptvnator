import { redactUrlCredentials } from './redact-url';

describe('redactUrlCredentials', () => {
    it('masks embedded credentials', () => {
        expect(
            redactUrlCredentials('http://tvh:s%40cret@192.168.1.10:9981/xmltv')
        ).toBe('http://***@192.168.1.10:9981/xmltv');
    });

    it('returns credential-free URLs unchanged', () => {
        expect(redactUrlCredentials('https://example.com/guide.xml')).toBe(
            'https://example.com/guide.xml'
        );
    });

    it('passes non-URL strings through', () => {
        expect(redactUrlCredentials('not a url')).toBe('not a url');
    });
});
