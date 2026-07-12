/**
 * Replaces embedded `user:pass@` URL credentials with `***@` so source URLs
 * can be logged without leaking secrets. Non-URL strings pass through as-is.
 */
export function redactUrlCredentials(rawUrl: string): string {
    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        return rawUrl;
    }

    if (!url.username && !url.password) {
        return rawUrl;
    }

    url.username = '***';
    url.password = '';
    return url.toString();
}
