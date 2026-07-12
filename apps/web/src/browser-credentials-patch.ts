export function applyBrowserCredentialsPatch() {
    if (typeof window === 'undefined') return;

    const originalFetch = window.fetch;
    window.fetch = async function (
        input: RequestInfo | URL,
        init?: RequestInit
    ): Promise<Response> {
        let urlStr = '';
        if (typeof input === 'string') {
            urlStr = input;
        } else if (input instanceof URL) {
            urlStr = input.toString();
        } else if (input instanceof Request) {
            urlStr = input.url;
        }

        if (urlStr.includes('@') && urlStr.startsWith('http')) {
            try {
                const parsedUrl = new URL(urlStr);
                if (parsedUrl.username || parsedUrl.password) {
                    const username = parsedUrl.username;
                    const password = parsedUrl.password;

                    parsedUrl.username = '';
                    parsedUrl.password = '';
                    const cleanUrl = parsedUrl.toString();

                    const authHeader =
                        'Basic ' +
                        btoa(
                            decodeURIComponent(username) +
                                ':' +
                                decodeURIComponent(password)
                        );

                    if (input instanceof Request) {
                        const newHeaders = new Headers(input.headers);
                        newHeaders.set('Authorization', authHeader);
                        const newInit: RequestInit = {
                            method: input.method,
                            headers: newHeaders,
                            body: input.body,
                            mode: input.mode,
                            credentials: input.credentials,
                            cache: input.cache,
                            redirect: input.redirect,
                            referrer: input.referrer,
                            integrity: input.integrity,
                        };
                        return originalFetch.call(this, cleanUrl, newInit);
                    } else {
                        const newInit = init ? { ...init } : {};
                        const newHeaders = new Headers(newInit.headers || {});
                        newHeaders.set('Authorization', authHeader);
                        newInit.headers = newHeaders;
                        return originalFetch.call(this, cleanUrl, newInit);
                    }
                }
            } catch (e) {
                // ignore parsing errors
            }
        }
        return originalFetch.call(this, input, init);
    };

    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (
        method: string,
        url: string | URL,
        async?: boolean,
        user?: string | null,
        password?: string | null
    ): void {
        let urlStr = typeof url === 'string' ? url : url.toString();

        if (urlStr.includes('@') && urlStr.startsWith('http')) {
            try {
                const parsedUrl = new URL(urlStr);
                if (parsedUrl.username || parsedUrl.password) {
                    const extractedUsername = decodeURIComponent(parsedUrl.username);
                    const extractedPassword = decodeURIComponent(parsedUrl.password);

                    parsedUrl.username = '';
                    parsedUrl.password = '';
                    urlStr = parsedUrl.toString();

                    const authHeader =
                        'Basic ' +
                        btoa(extractedUsername + ':' + extractedPassword);

                    const originalSend = this.send;
                    this.send = function (
                        body?: Document | XMLHttpRequestBodyInit | null
                    ) {
                        this.setRequestHeader('Authorization', authHeader);
                        return originalSend.call(this, body);
                    };
                }
            } catch (e) {
                // ignore
            }
        }

        if (async !== undefined) {
            if (user !== undefined && password !== undefined) {
                return originalOpen.call(this, method, urlStr, async, user, password);
            }
            return originalOpen.call(this, method, urlStr, async);
        }
        return originalOpen.call(this, method, urlStr);
    };
}
