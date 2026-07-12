import { createDevLogger } from '@iptvnator/shared/interfaces';
import mpegts from 'mpegts.js';
import {
    PlaybackDiagnostic,
    PlaybackSourceMetadata,
    classifyMpegTsPlaybackIssue,
    isMpegTsSourceBufferQuotaError,
} from '../playback-diagnostics/playback-diagnostics.util';

const debugMpegts = createDevLogger('MpegtsPlayerController');

/** Max automatic restarts after a SourceBuffer quota error */
const MAX_QUOTA_RETRIES = 2;
/** Delay before re-attaching, gives Chromium time to release detached MediaSources */
const QUOTA_RETRY_DELAY_MS = 250;

export interface MpegtsPlayRequest {
    readonly url: string;
    readonly mediaElement: HTMLVideoElement;
    readonly createMetadata: () => PlaybackSourceMetadata;
    readonly onIssue: (issue: PlaybackDiagnostic | null) => void;
    /** Called after (re-)attaching so the host can restart element playback */
    readonly onAttached: () => void;
}

/**
 * Owns the mpegts.js player lifecycle for raw MPEG-TS streams.
 *
 * Chromium releases the MediaSource/SourceBuffer resources of a detached
 * player asynchronously, so rapid channel zapping can exhaust the
 * SourceBuffer quota (QuotaExceededError: "reached the limit of SourceBuffer
 * objects") even though every player instance is destroyed correctly. When
 * that happens this controller tears the player down, resets the media
 * element and retries with a fresh MediaSource after a short delay instead
 * of surfacing a misleading "unsupported container" diagnostic.
 */
export class MpegtsPlayerController {
    private player: mpegts.Player | null = null;
    private retryTimer: ReturnType<typeof setTimeout> | null = null;
    private generation = 0;

    static isSupported(): boolean {
        return mpegts.isSupported();
    }

    play(request: MpegtsPlayRequest): void {
        this.stop();
        this.createPlayer(request, this.generation, 0);
    }

    /** Stops playback, releases the player, and cancels any pending retry. */
    stop(): void {
        this.generation++;
        if (this.retryTimer !== null) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }
        this.teardownPlayer();
    }

    private createPlayer(
        request: MpegtsPlayRequest,
        generation: number,
        attempt: number
    ): void {
        const player = mpegts.createPlayer({
            type: 'mpegts',
            isLive: true,
            url: request.url,
        });
        this.player = player;
        player.on(
            mpegts.Events.ERROR,
            (type: string, details: string, info: unknown): void => {
                this.handleError(request, generation, attempt, {
                    type,
                    details,
                    info,
                });
            }
        );
        player.attachMediaElement(request.mediaElement);
        player.load();
        request.onAttached();
    }

    private handleError(
        request: MpegtsPlayRequest,
        generation: number,
        attempt: number,
        error: { type: string; details: string; info: unknown }
    ): void {
        if (generation !== this.generation) {
            return;
        }

        if (
            isMpegTsSourceBufferQuotaError(error) &&
            attempt < MAX_QUOTA_RETRIES
        ) {
            debugMpegts(
                'SourceBuffer quota exhausted, restarting player (attempt',
                attempt + 1,
                'of',
                MAX_QUOTA_RETRIES,
                ')'
            );
            this.teardownPlayer();
            this.resetMediaElement(request.mediaElement);
            this.retryTimer = setTimeout(() => {
                this.retryTimer = null;
                if (generation !== this.generation) {
                    return;
                }
                this.createPlayer(request, generation, attempt + 1);
            }, QUOTA_RETRY_DELAY_MS);
            return;
        }

        request.onIssue(
            classifyMpegTsPlaybackIssue(error, request.createMetadata())
        );
    }

    private teardownPlayer(): void {
        const player = this.player;
        if (!player) {
            return;
        }
        this.player = null;
        const steps: ReadonlyArray<() => void> = [
            () => player.pause(),
            () => player.unload(),
            () => player.detachMediaElement(),
            () => player.destroy(),
        ];
        for (const step of steps) {
            try {
                step();
            } catch (error) {
                debugMpegts('mpegts player teardown step failed:', error);
            }
        }
    }

    private resetMediaElement(element: HTMLVideoElement): void {
        element.removeAttribute('src');
        element.replaceChildren();
        element.load();
    }
}
