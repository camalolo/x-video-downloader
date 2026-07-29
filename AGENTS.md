# X Video Downloader

## Architecture

Two content scripts with different world contexts:

| File | World | Role |
|------|-------|------|
| `inject.js` | MAIN | Reads React props from DOM, extracts video URLs, writes `data-xdl-url` attribute |
| `content.js` | ISOLATED | Injects download button UI, handles clicks, sends messages to background. Also handles country-based post filtering |
| `background.js` | Service worker | Downloads video via `chrome.downloads.download()`. Fetches `AboutAccountQuery` GraphQL for country lookups |
| `popup.html/js/css` | Popup | Settings UI for managing blocked countries |

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

## Country Filter Feature

Hides posts from countries the user chooses to block, using X's "About This Account" IP-inferred country data.

### Data flow
1. `content.js` extracts `screen_name` from article DOM (`a[href*="/status/"]`)
2. Sends `XDL_LOOKUP` message with screen_name + CSRF token (from `ct0` cookie) to background
3. `background.js` fetches `AboutAccountQuery` GraphQL endpoint → `about_profile.account_based_in`
4. Result cached (in-memory Map + `chrome.storage.local`) with 24h TTL
5. If country is in blocked list → article gets `.xdl-blocked` class (content hidden, notice shown)

### Storage schema (`chrome.storage.local`)
- `xdl_filter_enabled` (bool) — master toggle
- `xdl_blocked_countries` (string[]) — blocked country names
- `xdl_cache` (object) — `{ screenName: {country, accurate, ts} }`

### Known limitations
- **queryId fragility**: `AboutAccountQuery` queryId changes per X.com deploy. Two fallback IDs are hardcoded in `background.js` (`QUERY_IDS`). If lookups fail, check for a new queryId in X.com's JS bundles.
- **Rate limiting**: Sequential queue with 200ms delay between API calls. Heavy scrolling may temporarily exceed limits.
- **CSRF dependency**: Requires logged-in session (reads `ct0` cookie via `document.cookie`).
