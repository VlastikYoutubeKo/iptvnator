/**
 * Pure helpers for Stalker portal URL handling, shared by the manual Stalker
 * import form and the AMZ IPTV hash import so both produce identical
 * playlist records for the same portal URL.
 */

/**
 * Checks if the URL is a full stalker portal URL that requires handshake
 * authentication. Pattern: example.com/stalker_portal/c or
 * example.com/stalker_portal/...
 */
export function isFullStalkerPortalUrl(url: string): boolean {
    return url.includes('/stalker_portal');
}

/**
 * Transforms the portal URL to the correct API endpoint
 * - Simple URL (example.com/c) -> example.com/portal.php
 * - Full stalker portal (example.com/stalker_portal/c) ->
 *   example.com/stalker_portal/server/load.php
 */
export function transformStalkerPortalUrl(url: string): string {
    // Remove trailing slashes
    url = url.replace(/\/+$/, '');

    // Case 1: Simple URL ending with /c -> convert to /portal.php
    if (url.endsWith('/c')) {
        // Check if it's a full stalker portal URL
        if (url.includes('/stalker_portal')) {
            // example.com/stalker_portal/c -> example.com/stalker_portal/server/load.php
            return url.replace(
                /\/stalker_portal\/c$/,
                '/stalker_portal/server/load.php'
            );
        }
        // Simple URL: example.com/c -> example.com/portal.php
        return url.replace(/\/c$/, '/portal.php');
    }

    // Case 2: Full stalker portal URL without /c at the end
    if (url.includes('/stalker_portal') && !url.includes('/server/load.php')) {
        // example.com/stalker_portal -> example.com/stalker_portal/server/load.php
        if (url.endsWith('/stalker_portal')) {
            return url + '/server/load.php';
        }
        // If it has other path segments after /stalker_portal, append server/load.php
        if (!url.endsWith('/load.php')) {
            return url.replace(
                /\/stalker_portal(\/.*)?$/,
                '/stalker_portal/server/load.php'
            );
        }
    }

    // Otherwise keep the provided url
    return url;
}
