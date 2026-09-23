'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface RunningTimer {
    id: number;
    label: string;
    /** Which step it was started from, 0-based. */
    step: number;
    endsAt: number;
    done: boolean;
}

/**
 * Kitchen timers that keep counting while the page is open, and make
 * themselves known when they run out: a tone, a buzz where the phone can, and
 * the timer turning into a "done" that stays until it is dismissed.
 *
 * Counted from a fixed end time rather than by ticking down, so a phone that
 * throttled the page in the background still shows the right number when it
 * comes back.
 */
export function useCookTimers() {
    const [timers, setTimers] = useState<RunningTimer[]>([]);
    const [now, setNow] = useState(() => Date.now());
    const nextId = useRef(1);
    const audio = useRef<AudioContext | null>(null);

    const running = timers.some((timer) => !timer.done);

    useEffect(() => {
        if (!running) return;
        const interval = window.setInterval(() => setNow(Date.now()), 500);
        return () => window.clearInterval(interval);
    }, [running]);

    const ring = useCallback(() => {
        try {
            const context = audio.current ?? new AudioContext();
            audio.current = context;
            for (let beep = 0; beep < 3; beep += 1) {
                const oscillator = context.createOscillator();
                const gain = context.createGain();
                oscillator.frequency.value = 880;
                gain.gain.setValueAtTime(0.25, context.currentTime + beep * 0.4);
                gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + beep * 0.4 + 0.3);
                oscillator.connect(gain).connect(context.destination);
                oscillator.start(context.currentTime + beep * 0.4);
                oscillator.stop(context.currentTime + beep * 0.4 + 0.3);
            }
        } catch {
            // No sound available: the timer still turns into "done" on screen.
        }
        navigator.vibrate?.([300, 150, 300, 150, 300]);
    }, []);

    // Anything that has run out since the last look.
    useEffect(() => {
        const finished = timers.filter((timer) => !timer.done && timer.endsAt <= now);
        if (finished.length === 0) return;
        ring();
        setTimers((current) => current.map((timer) => (timer.endsAt <= now ? { ...timer, done: true } : timer)));
    }, [now, timers, ring]);

    const start = useCallback((label: string, seconds: number, step: number) => {
        // Created on the tap, where a browser allows sound to start later.
        try {
            audio.current ??= new AudioContext();
        } catch {
            // No audio on this device.
        }
        const id = nextId.current++;
        setNow(Date.now());
        setTimers((current) => [...current, { id, label, step, endsAt: Date.now() + seconds * 1000, done: false }]);
    }, []);

    const dismiss = useCallback((id: number) => setTimers((current) => current.filter((timer) => timer.id !== id)), []);

    return { timers, now, start, dismiss };
}
