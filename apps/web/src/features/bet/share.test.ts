import { describe, expect, it, vi } from 'vitest';
import { shareLink, type ShareNavigator } from './share';

const URL_ = 'https://sporim.fun/b/Ab3xK9mQ';
const request = (preferSheet: boolean) => ({ url: URL_, text: 'Take the other side', preferSheet });

function abortError(): Error {
  const error = new Error('cancelled');
  error.name = 'AbortError';
  return error;
}

describe('shareLink', () => {
  it('opens the share sheet on a touch device', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);

    expect(await shareLink(request(true), { share, clipboard: { writeText } })).toBe('shared');
    expect(share).toHaveBeenCalledWith({ url: URL_, text: 'Take the other side' });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('copies on a desktop even when the browser offers a share sheet', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const writeText = vi.fn().mockResolvedValue(undefined);

    expect(await shareLink(request(false), { share, clipboard: { writeText } })).toBe('copied');
    expect(share).not.toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledWith(URL_);
  });

  it('respects a closed sheet instead of copying behind the person’s back', async () => {
    const share = vi.fn().mockRejectedValue(abortError());
    const writeText = vi.fn().mockResolvedValue(undefined);

    expect(await shareLink(request(true), { share, clipboard: { writeText } })).toBe('cancelled');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('falls back to the clipboard when the sheet fails for any other reason', async () => {
    const share = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
    const writeText = vi.fn().mockResolvedValue(undefined);

    expect(await shareLink(request(true), { share, clipboard: { writeText } })).toBe('copied');
  });

  it('copies on a touch device with no share sheet (in-app webviews)', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    expect(await shareLink(request(true), { clipboard: { writeText } })).toBe('copied');
  });

  it('reports unavailable when neither works, so the screen points at the printed link', async () => {
    const nav: ShareNavigator = {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error()) },
    };
    expect(await shareLink(request(false), nav)).toBe('unavailable');
    expect(await shareLink(request(false), {})).toBe('unavailable');
  });
});
