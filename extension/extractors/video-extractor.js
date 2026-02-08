/**
 * Video Extractor
 * Extracts captions/subtitles from HTML5 <video> elements with <track> tags
 * Works on any site using standard HTML5 video with caption tracks
 */

(function() {
  /**
   * Extract captions from video elements on the page
   * @returns {Promise<Object>} - Extraction result
   */
  async function extract() {
    const text = await extractCaptions();

    if (!text || text.length < 50) {
      // Fallback: try to extract page text instead
      if (window.__webpageExtractor) {
        console.log('No captions found, falling back to page text extraction');
        return window.__webpageExtractor.extract();
      }
      throw new Error('No captions found for the video on this page.');
    }

    return {
      success: true,
      transcript: text,
      creatorComments: [],
      viewerComments: []
    };
  }

  /**
   * Find and parse caption tracks from video elements
   * @returns {Promise<string>} - Parsed caption text
   */
  async function extractCaptions() {
    const videos = document.querySelectorAll('video');

    for (const video of videos) {
      const tracks = video.querySelectorAll('track[kind="captions"], track[kind="subtitles"]');

      for (const track of tracks) {
        const src = track.src || track.getAttribute('src');
        if (!src) continue;

        try {
          const response = await fetch(src);
          if (!response.ok) continue;

          const text = await response.text();

          // Detect format and parse
          if (src.endsWith('.vtt') || text.startsWith('WEBVTT')) {
            return parseVTT(text);
          } else if (src.endsWith('.srt') || /^\d+\r?\n\d{2}:\d{2}/.test(text)) {
            return parseSRT(text);
          }

          // Try VTT parse as default
          return parseVTT(text);
        } catch (e) {
          console.error('Error fetching caption track:', e);
          continue;
        }
      }
    }

    return '';
  }

  /**
   * Parse WebVTT format
   * @param {string} vtt - VTT file content
   * @returns {string} - Plain text
   */
  function parseVTT(vtt) {
    const lines = vtt.split('\n');
    const textLines = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip VTT header, timestamps, cue ids, and empty lines
      if (line === 'WEBVTT' ||
          line === '' ||
          /^\d+$/.test(line) ||
          /-->/.test(line) ||
          /^NOTE/.test(line) ||
          /^STYLE/.test(line)) {
        continue;
      }

      // Remove VTT formatting tags
      const cleanLine = line
        .replace(/<[^>]+>/g, '')  // Remove HTML tags
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim();

      if (cleanLine.length > 0) {
        textLines.push(cleanLine);
      }
    }

    // Deduplicate consecutive identical lines
    const deduped = textLines.filter((line, i) => i === 0 || line !== textLines[i - 1]);

    return deduped.join(' ').replace(/\s+/g, ' ').trim();
  }

  /**
   * Parse SRT format
   * @param {string} srt - SRT file content
   * @returns {string} - Plain text
   */
  function parseSRT(srt) {
    const blocks = srt.split(/\r?\n\r?\n/);
    const textLines = [];

    for (const block of blocks) {
      const lines = block.trim().split('\n');
      // SRT blocks: index, timestamp, text (one or more lines)
      for (let i = 2; i < lines.length; i++) {
        const line = lines[i].trim()
          .replace(/<[^>]+>/g, '')
          .replace(/\{[^}]+\}/g, '');

        if (line.length > 0) {
          textLines.push(line);
        }
      }
    }

    const deduped = textLines.filter((line, i) => i === 0 || line !== textLines[i - 1]);
    return deduped.join(' ').replace(/\s+/g, ' ').trim();
  }

  window.__videoExtractor = {
    extract,
    extractCaptions,
    parseVTT,
    parseSRT
  };
})();
