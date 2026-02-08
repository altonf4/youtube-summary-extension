/**
 * YouTube Summary Extension - Content Script (Legacy)
 *
 * This file is no longer used directly. The content script functionality
 * has been refactored into a modular architecture:
 *
 * - extractors/base-extractor.js  - Shared UI (popup, floating button, sidebar)
 * - extractors/youtube-extractor.js - YouTube transcript/comment extraction
 * - extractors/article-extractor.js - Article text extraction
 * - extractors/webpage-extractor.js - Fallback page text extraction
 * - extractors/video-extractor.js - HTML5 video caption extraction
 * - extractors/selection-extractor.js - Text selection extraction
 * - content-detector.js - Content type detection and initialization
 *
 * See CLAUDE.md for architecture details.
 */
