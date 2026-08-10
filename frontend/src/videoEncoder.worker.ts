/**
 * Video Encoder Web Worker
 * Uses WebCodecs API for H264 encoding with mp4-muxer for container
 */

import { ArrayBufferTarget, Muxer } from 'mp4-muxer';

interface EncoderConfig {
    width: number;
    height: number;
    fps: number;
}

interface FrameData {
    imageData: ImageBitmap;
    timestamp: number;
    duration: number;
}

type EncoderMessage =
    | { type: 'init'; data: EncoderConfig }
    | { type: 'frame'; data: FrameData }
    | { type: 'finish' }
    | { type: 'abort' };

const errorMessage = (error: unknown): string => (
    error instanceof Error ? error.message : String(error)
);

const parseMessage = (value: unknown): EncoderMessage => {
    if (value === null || typeof value !== 'object' || !('type' in value)) {
        throw new TypeError('Video encoder message must be an object with a type.');
    }
    const message = value as { type: unknown; data?: unknown };
    if (message.type === 'finish' || message.type === 'abort') return { type: message.type };
    if (message.type === 'init') return { type: 'init', data: message.data as EncoderConfig };
    if (message.type === 'frame') return { type: 'frame', data: message.data as FrameData };
    throw new TypeError(`Unknown video encoder message: ${String(message.type)}`);
};

let muxer: Muxer<ArrayBufferTarget> | null = null;
let videoEncoder: VideoEncoder | null = null;
let frameCount = 0;

self.onmessage = async function (event: MessageEvent<unknown>): Promise<void> {
    let message: EncoderMessage;
    try {
        message = parseMessage(event.data);
    } catch (error) {
        self.postMessage({ type: 'error', error: errorMessage(error) });
        return;
    }

    switch (message.type) {
        case 'init':
            await initEncoder(message.data);
            break;
        case 'frame':
            await encodeFrame(message.data);
            break;
        case 'finish':
            await finishEncoding();
            break;
        case 'abort':
            abortEncoding();
            break;
    }
};

async function initEncoder(config: EncoderConfig): Promise<void> {
    const { width, height, fps } = config;

    frameCount = 0;

    try {
        // Check WebCodecs support
        if (typeof VideoEncoder === 'undefined') {
            throw new Error('WebCodecs API not supported in this browser');
        }

        // Initialize mp4-muxer
        const nextMuxer = new Muxer({
            target: new ArrayBufferTarget(),
            video: {
                codec: 'avc',
                width: width,
                height: height,
            },
            fastStart: 'in-memory',
        });

        videoEncoder = new VideoEncoder({
            output: (chunk, meta) => {
                nextMuxer.addVideoChunk(chunk, meta);
            },
            error: (err) => {
                console.error('VideoEncoder error:', err);
                self.postMessage({ type: 'error', error: err.message });
            }
        });
        muxer = nextMuxer;

        // Configure encoder - using AVC (H.264) baseline profile
        await videoEncoder.configure({
            codec: 'avc1.42001f', // H.264 baseline profile level 3.1
            width: width,
            height: height,
            bitrate: 5_000_000, // 5 Mbps for good quality
            framerate: fps,
            latencyMode: 'quality',
            avc: { format: 'avc' },
        });

        self.postMessage({ type: 'ready' });
    } catch (err) {
        console.error('Failed to initialize encoder:', err);
        self.postMessage({ type: 'error', error: errorMessage(err) });
    }
}

async function encodeFrame(data: FrameData): Promise<void> {
    const { imageData, timestamp, duration } = data;

    if (!videoEncoder || videoEncoder.state !== 'configured') {
        self.postMessage({ type: 'error', error: 'Encoder not ready' });
        return;
    }

    try {
        // Create VideoFrame from ImageBitmap
        const frame = new VideoFrame(imageData, {
            timestamp: timestamp,
            duration: duration,
        });

        // Encode frame (keyframe on every frame for low FPS videos)
        const keyFrame = true;
        videoEncoder.encode(frame, { keyFrame });
        frame.close();

        frameCount++;
        self.postMessage({ type: 'progress', frameCount });
    } catch (err) {
        console.error('Frame encoding error:', err);
        self.postMessage({ type: 'error', error: errorMessage(err) });
    }
}

async function finishEncoding(): Promise<void> {
    if (!videoEncoder || !muxer) {
        self.postMessage({ type: 'error', error: 'Encoder not initialized' });
        return;
    }

    try {
        await videoEncoder.flush();
        videoEncoder.close();

        muxer.finalize();

        const buffer = muxer.target.buffer;
        const blob = new Blob([buffer], { type: 'video/mp4' });

        self.postMessage({
            type: 'complete',
            blob: blob,
            frameCount: frameCount
        });
    } catch (err) {
        console.error('Finalization error:', err);
        self.postMessage({ type: 'error', error: errorMessage(err) });
    }
}

function abortEncoding(): void {
    try {
        if (videoEncoder && videoEncoder.state !== 'closed') {
            videoEncoder.close();
        }
        muxer = null;
        videoEncoder = null;
        frameCount = 0;
    } catch (err) {
        console.error('Abort error:', err);
    }
    self.postMessage({ type: 'aborted' });
}
