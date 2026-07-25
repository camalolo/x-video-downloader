# X Video Downloader

## Architecture

Two content scripts with different world contexts:

| File | World | Role |
|------|-------|------|
| `inject.js` | MAIN | Reads React props from DOM, extracts video URLs, writes `data-xdl-url` attribute |
| `content.js` | ISOLATED | Injects download button UI, handles clicks, sends messages to background |
| `background.js` | Service worker | Downloads video via `chrome.downloads.download()` |

Cross-world communication uses DOM attributes (shared between worlds) and `window.postMessage`.

## Key technical details

- **React props extraction**: `inject.js` finds elements with `__reactProps$*` keys and walks the component tree to locate tweet objects containing `entities.media[].video_info.variants`.
- **Video quality**: Picks the highest-bitrate MP4 variant from `video_info.variants`.
- **Virtual scroll handling**: Detects article recycling by comparing stored tweet ID with current URL; clears stale attributes when a tweet changes.
- **Button placement**: Inserted before the share button's container (last child of `[role="group"]` action bar).

## Common issues

### Button not appearing
- Check that the tweet actually has a video (not just an image)
- The `inject.js` may need 1-2 seconds to scan new tweets after scroll
- React props path may change with X.com updates — check `findTweet()` in `inject.js`

### Download fails
- Ensure `https://video.twimg.com/*` is in `host_permissions`
- Check the browser console for `chrome.runtime.lastError` messages

## Publishing

```bash
npm run pack      # Build .zip and .crx
npm run publish   # Tag and release
```
