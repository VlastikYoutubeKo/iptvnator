import {
    PlaybackDiagnosticCode,
    classifyMpegTsPlaybackIssue,
    createPlaybackSourceMetadata,
    isMpegTsSourceBufferQuotaError,
} from './playback-diagnostics.util';

describe('playback diagnostics (mpegts)', () => {
    it('classifies mpegts browser fetch restrictions separately from generic network errors', () => {
        const issue = classifyMpegTsPlaybackIssue(
            {
                type: 'NetworkError',
                details:
                    'Fetch blocked by access-control policy while loading segment',
            },
            createPlaybackSourceMetadata({
                url: 'https://provider.example/live/channel.ts',
                mimeType: 'video/mp2t',
                player: 'videojs',
            })
        );

        expect(issue.code).toBe('browser-access-error');
        expect(issue.externalFallbackRecommended).toBe(true);
    });

    it('classifies mpegts early EOF failures as fallback-actionable media errors', () => {
        const issue = classifyMpegTsPlaybackIssue(
            {
                type: 'NetworkError',
                details: 'UnrecoverableEarlyEof',
                info: { msg: 'Fetch stream meet Early-EOF' },
            },
            createPlaybackSourceMetadata({
                url: 'https://provider.example/movie/123.ts',
                mimeType: 'video/mp2t',
                player: 'videojs',
            })
        );

        expect(issue.code).toBe(PlaybackDiagnosticCode.MediaDecodeError);
        expect(issue.externalFallbackRecommended).toBe(true);
        expect(issue.details).toContain('Early-EOF');
    });

    it('classifies mpegts codec errors as unsupported codec fallbacks', () => {
        const issue = classifyMpegTsPlaybackIssue(
            {
                type: 'MediaError',
                details: 'MediaCodecUnsupported',
            },
            createPlaybackSourceMetadata({
                url: 'https://example.com/live/channel.ts',
                mimeType: 'video/mp2t',
                player: 'videojs',
            })
        );

        expect(issue.code).toBe(PlaybackDiagnosticCode.UnsupportedCodec);
        expect(issue.externalFallbackRecommended).toBe(true);
    });

    it('does not classify SourceBuffer quota exhaustion as an unsupported container', () => {
        const quotaError = {
            type: 'MediaError',
            details: 'MediaMSEError',
            info: {
                code: 22,
                msg: "Failed to execute 'addSourceBuffer' on 'MediaSource': This MediaSource has reached the limit of SourceBuffer objects it can handle. No additional SourceBuffer objects may be added.",
            },
        };

        expect(isMpegTsSourceBufferQuotaError(quotaError)).toBe(true);

        const issue = classifyMpegTsPlaybackIssue(
            quotaError,
            createPlaybackSourceMetadata({
                url: 'https://provider.example/stream/channelid/1?profile=pass',
                mimeType: 'video/mp2t',
                player: 'html5',
            })
        );

        expect(issue.code).toBe(PlaybackDiagnosticCode.UnknownPlaybackError);
    });

    it('still classifies other MSE errors as unsupported container', () => {
        const issue = classifyMpegTsPlaybackIssue(
            {
                type: 'MediaError',
                details: 'MediaMSEError',
                info: { msg: 'SourceBuffer append failed' },
            },
            createPlaybackSourceMetadata({
                url: 'https://provider.example/live/channel.ts',
                mimeType: 'video/mp2t',
                player: 'html5',
            })
        );

        expect(issue.code).toBe(PlaybackDiagnosticCode.UnsupportedContainer);
    });
});
