# X Video Downloader

Chrome extension that adds a one-click download button to X.com (Twitter) posts containing videos.

## What it does

For every post with a video or animated GIF, a download button appears in the action bar — right next to the existing **Share** button. Click it and the highest-quality MP4 is saved to your Downloads folder.

## How it works

1. **`inject.js`** runs in the page's JavaScript context (MAIN world) and reads tweet data directly from React component props — no API calls, no authentication, no third-party services.
2. **`content.js`** (isolated world) watches the timeline via `MutationObserver`, injects the download button next to the share button for any tweet flagged as containing video, and handles click events.
3. **`background.js`** (MV3 service worker) triggers the actual download via `chrome.downloads.download()`.

The video URL is passed between `inject.js` and `content.js` through a shared DOM attribute (`data-xdl-url`), which is accessible from both JavaScript worlds.

## Installation

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select this folder
4. Navigate to any X.com post with a video — the download button appears automatically

## Development

```bash
npm install
npm run lint
npm run pack      # Builds .zip and .crx in dist/
npm run publish   # Tags release and publishes to GitHub
```
