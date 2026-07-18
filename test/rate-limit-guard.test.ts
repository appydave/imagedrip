import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimitGuard } from '../src/main/rate-limit-guard';

describe('RateLimitGuard', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('is not paused until a limit is hit', () => {
    const guard = new RateLimitGuard();
    expect(guard.isPaused).toBe(false);
    expect(guard.msUntilResume()).toBe(0);
  });

  it('pauses on hit and notifies with a resumeAt', () => {
    const onPause = vi.fn();
    const guard = new RateLimitGuard({ backoffMs: 1000, onPause });
    guard.hit('image generation limit');
    expect(guard.isPaused).toBe(true);
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(guard.msUntilResume()).toBeGreaterThan(0);
  });

  it('auto-resumes after the backoff elapses', () => {
    const onResume = vi.fn();
    const guard = new RateLimitGuard({ backoffMs: 1000, onResume });
    guard.hit('limit');
    expect(guard.isPaused).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(guard.isPaused).toBe(false);
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('de-dupes repeat banners while already paused (no double-pause)', () => {
    const onPause = vi.fn();
    const guard = new RateLimitGuard({ backoffMs: 5000, onPause });
    guard.hit('limit');
    guard.hit('limit'); // observer re-fires the same banner
    guard.hit('limit');
    expect(onPause).toHaveBeenCalledTimes(1);
  });

  it('can be force-resumed early', () => {
    const onResume = vi.fn();
    const guard = new RateLimitGuard({ backoffMs: 60000, onResume });
    guard.hit('limit');
    guard.resume();
    expect(guard.isPaused).toBe(false);
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('dispose clears the timer without resuming', () => {
    const onResume = vi.fn();
    const guard = new RateLimitGuard({ backoffMs: 1000, onResume });
    guard.hit('limit');
    guard.dispose();
    vi.advanceTimersByTime(2000);
    expect(guard.isPaused).toBe(false);
    expect(onResume).not.toHaveBeenCalled();
  });
});
