import {
    PlaybackDiagnostic,
    createPlaybackSourceMetadata,
} from '../playback-diagnostics/playback-diagnostics.util';
import type {
    MpegtsPlayerController as MpegtsPlayerControllerType,
    MpegtsPlayRequest,
} from './mpegts-player-controller';

type ErrorListener = (type: string, details: string, info: unknown) => void;

class MockMpegTsPlayer {
    private errorListener: ErrorListener | undefined;

    readonly on = jest.fn((_event: string, listener: ErrorListener) => {
        this.errorListener = listener;
    });
    readonly attachMediaElement = jest.fn();
    readonly load = jest.fn();
    readonly pause = jest.fn();
    readonly unload = jest.fn();
    readonly detachMediaElement = jest.fn();
    readonly destroy = jest.fn();

    constructor() {
        mpegTsInstances.push(this);
    }

    emitError(type: string, details: string, info: unknown): void {
        this.errorListener?.(type, details, info);
    }
}

const mpegTsInstances: MockMpegTsPlayer[] = [];

jest.unstable_mockModule('mpegts.js', () => ({
    default: {
        Events: {
            ERROR: 'error',
        },
        createPlayer: jest.fn(() => new MockMpegTsPlayer()),
        isSupported: jest.fn(() => true),
    },
}));

const QUOTA_ERROR = {
    type: 'MediaError',
    details: 'MediaMSEError',
    info: {
        code: 22,
        msg: "Failed to execute 'addSourceBuffer' on 'MediaSource': This MediaSource has reached the limit of SourceBuffer objects it can handle.",
    },
} as const;

describe('MpegtsPlayerController', () => {
    let MpegtsPlayerController: typeof import('./mpegts-player-controller').MpegtsPlayerController;
    let controller: MpegtsPlayerControllerType;
    let issues: (PlaybackDiagnostic | null)[];
    let onAttached: jest.Mock;
    let mediaElement: HTMLVideoElement;

    const buildRequest = (): MpegtsPlayRequest => ({
        url: 'https://provider.example/stream/channelid/1?profile=pass',
        mediaElement,
        createMetadata: () =>
            createPlaybackSourceMetadata({
                url: 'https://provider.example/stream/channelid/1?profile=pass',
                mimeType: 'video/mp2t',
            }),
        onIssue: (issue) => issues.push(issue),
        onAttached,
    });

    const lastPlayer = (): MockMpegTsPlayer =>
        mpegTsInstances[mpegTsInstances.length - 1];

    beforeAll(async () => {
        ({ MpegtsPlayerController } = await import(
            './mpegts-player-controller'
        ));
    });

    beforeEach(() => {
        jest.useFakeTimers();
        mpegTsInstances.length = 0;
        controller = new MpegtsPlayerController();
        issues = [];
        onAttached = jest.fn();
        mediaElement = document.createElement('video');
        mediaElement.load = jest.fn();
    });

    afterEach(() => {
        controller.stop();
        jest.useRealTimers();
    });

    it('creates, attaches and loads a player', () => {
        controller.play(buildRequest());

        expect(mpegTsInstances).toHaveLength(1);
        expect(mpegTsInstances[0].attachMediaElement).toHaveBeenCalledWith(
            mediaElement
        );
        expect(mpegTsInstances[0].load).toHaveBeenCalled();
        expect(onAttached).toHaveBeenCalledTimes(1);
    });

    it('restarts with a fresh player after a SourceBuffer quota error', () => {
        controller.play(buildRequest());

        mpegTsInstances[0].emitError(
            QUOTA_ERROR.type,
            QUOTA_ERROR.details,
            QUOTA_ERROR.info
        );

        expect(mpegTsInstances[0].destroy).toHaveBeenCalled();
        expect(mediaElement.load).toHaveBeenCalled();
        expect(issues).toHaveLength(0);
        expect(mpegTsInstances).toHaveLength(1);

        jest.advanceTimersByTime(300);

        expect(mpegTsInstances).toHaveLength(2);
        expect(mpegTsInstances[1].load).toHaveBeenCalled();
        expect(onAttached).toHaveBeenCalledTimes(2);
        expect(issues).toHaveLength(0);
    });

    it('emits a diagnostic once quota retries are exhausted', () => {
        controller.play(buildRequest());

        for (let i = 0; i < 3; i++) {
            lastPlayer().emitError(
                QUOTA_ERROR.type,
                QUOTA_ERROR.details,
                QUOTA_ERROR.info
            );
            jest.advanceTimersByTime(300);
        }

        expect(mpegTsInstances).toHaveLength(3);
        expect(issues).toHaveLength(1);
        expect(issues[0]?.code).toBe('unknown-playback-error');
    });

    it('emits non-quota errors immediately without retrying', () => {
        controller.play(buildRequest());

        mpegTsInstances[0].emitError('MediaError', 'MediaCodecUnsupported', {});
        jest.advanceTimersByTime(1000);

        expect(mpegTsInstances).toHaveLength(1);
        expect(issues).toHaveLength(1);
        expect(issues[0]?.code).toBe('unsupported-codec');
    });

    it('cancels a pending quota retry when stopped', () => {
        controller.play(buildRequest());

        mpegTsInstances[0].emitError(
            QUOTA_ERROR.type,
            QUOTA_ERROR.details,
            QUOTA_ERROR.info
        );
        controller.stop();
        jest.advanceTimersByTime(1000);

        expect(mpegTsInstances).toHaveLength(1);
        expect(issues).toHaveLength(0);
    });

    it('ignores late errors from a replaced player', () => {
        controller.play(buildRequest());
        const firstPlayer = mpegTsInstances[0];

        controller.play(buildRequest());
        expect(firstPlayer.destroy).toHaveBeenCalled();

        firstPlayer.emitError(
            QUOTA_ERROR.type,
            QUOTA_ERROR.details,
            QUOTA_ERROR.info
        );
        jest.advanceTimersByTime(1000);

        expect(mpegTsInstances).toHaveLength(2);
        expect(issues).toHaveLength(0);
    });
});
