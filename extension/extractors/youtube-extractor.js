/**
 * YouTube Extractor
 * Handles transcript extraction, comment extraction, and YouTube-specific metadata
 * Extracted from the original content.js
 */

(function() {
  // Extract video ID from YouTube URL
  function getVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v');
  }

  // Extract video title from page
  function getVideoTitle() {
    const selectors = [
      'h1.ytd-watch-metadata yt-formatted-string',
      'h1.ytd-video-primary-info-renderer yt-formatted-string',
      '#title h1 yt-formatted-string',
      'ytd-watch-metadata h1',
      '#above-the-fold #title',
      'h1.title'
    ];
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent.trim()) {
        return el.textContent.trim();
      }
    }
    return document.title.replace(/ - YouTube$/, '').trim() || 'Unknown Title';
  }

  // Extract video description from page
  function getVideoDescription() {
    const descriptionContainer = document.querySelector('#description-inner, ytd-text-inline-expander #plain-snippet-text, #description .content');

    if (descriptionContainer) {
      return descriptionContainer.innerText || descriptionContainer.textContent || '';
    }

    const expandedDesc = document.querySelector('ytd-text-inline-expander .yt-core-attributed-string');
    if (expandedDesc) {
      return expandedDesc.innerText || expandedDesc.textContent || '';
    }

    return '';
  }

  // Extract links from video description
  function getDescriptionLinks() {
    const links = [];
    const descriptionContainer = document.querySelector('#description-inner, ytd-text-inline-expander, #description .content');

    if (descriptionContainer) {
      const anchorElements = descriptionContainer.querySelectorAll('a[href]');
      anchorElements.forEach(anchor => {
        const href = anchor.href;
        const text = anchor.textContent.trim();

        if (href && !href.includes('youtube.com/hashtag') &&
            !href.startsWith('https://www.youtube.com/watch') &&
            !href.includes('/channel/') &&
            !href.includes('/c/') &&
            text.length > 0) {
          links.push({ url: href, text: text });
        }
      });
    }

    return links;
  }

  /**
   * Extract top comments from the video
   * Prioritizes creator comments/replies
   * @param {number} maxComments - Maximum number of comments to extract
   * @returns {Promise<Object>} - Object with creatorComments and viewerComments arrays
   */
  async function extractTopComments(maxComments = 20) {
    const creatorComments = [];
    const viewerComments = [];

    try {
      let commentSection = document.querySelector('ytd-comments#comments');
      if (!commentSection) {
        return { creatorComments: [], viewerComments: [] };
      }

      const commentThreads = document.querySelectorAll('ytd-comment-thread-renderer');
      if (commentThreads.length === 0) {
        return { creatorComments: [], viewerComments: [] };
      }

      commentThreads.forEach(thread => {
        try {
          processComment(thread.querySelector('#comment'), false);
          const replies = thread.querySelectorAll('ytd-comment-renderer');
          replies.forEach(reply => processComment(reply, true));
        } catch (e) {
          // Skip problematic comments
        }
      });

      function processComment(commentEl, isReply) {
        if (!commentEl) return;

        const body = commentEl.querySelector('#body');
        if (!body) return;

        const textElement = body.querySelector('#content-text');
        const text = textElement ? textElement.textContent.trim() : '';

        if (!text || text.length < 10) return;

        const authorBadge = commentEl.querySelector('#author-comment-badge, ytd-author-comment-badge-renderer');
        const isCreator = !!authorBadge;

        const likeElement = body.querySelector('#vote-count-middle');
        let likes = 0;
        if (likeElement) {
          const likeText = likeElement.textContent.trim();
          if (likeText) {
            if (likeText.includes('K')) {
              likes = parseFloat(likeText) * 1000;
            } else if (likeText.includes('M')) {
              likes = parseFloat(likeText) * 1000000;
            } else {
              likes = parseInt(likeText, 10) || 0;
            }
          }
        }

        const authorElement = body.querySelector('#author-text span, #author-text');
        const author = authorElement ? authorElement.textContent.trim() : 'Unknown';

        const comment = {
          text: text,
          likes: likes,
          author: author,
          isReply: isReply
        };

        if (isCreator) {
          creatorComments.push(comment);
        } else {
          viewerComments.push(comment);
        }
      }

      viewerComments.sort((a, b) => b.likes - a.likes);

      return {
        creatorComments: creatorComments.slice(0, 10),
        viewerComments: viewerComments.slice(0, maxComments)
      };

    } catch (error) {
      console.error('Error extracting comments:', error);
      return { creatorComments: [], viewerComments: [] };
    }
  }

  // Extract transcript from YouTube's DOM
  async function extractTranscript() {
    // Open the transcript panel if no segments are visible yet
    let segments = getTranscriptSegments();

    if (segments.length === 0) {
      await openTranscriptPanel();

      // Wait for an engagement panel to appear. YouTube has multiple panel IDs:
      //   - engagement-panel-searchable-transcript: legacy transcript panel
      //   - PAmodern_transcript_view: 2025+ modern transcript panel
      //   - engagement-panel-macro-markers-description-chapters: "In this video"
      //     panel with Chapters/Transcript tabs (videos that have chapters)
      try {
        await Promise.any([
          waitForElement('ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]', 10000),
          waitForElement('ytd-engagement-panel-section-list-renderer[target-id="PAmodern_transcript_view"]', 10000),
          waitForElement('ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-macro-markers-description-chapters"]', 10000)
        ]);
      } catch (e) {
        // No panel appeared
      }

      // If the panel has Chapters/Transcript tabs (videos with chapters),
      // click the Transcript tab. Must wait for the panel to render its chips.
      await selectTranscriptTab();

      // Poll for transcript segments to appear. YouTube lazily renders them
      // and MutationObserver doesn't reliably catch their appearance.
      segments = await pollForTranscriptSegments(15000);
    }

    if (segments.length === 0) {
      throw new Error('No transcript segments found. This video may not have captions.');
    }

    const isNewLayout = segments[0].tagName.toLowerCase() === 'transcript-segment-view-model';

    const transcriptParts = [];
    segments.forEach(segment => {
      const text = extractSegmentText(segment, isNewLayout);
      if (text) {
        transcriptParts.push(text);
      }
    });

    const fullTranscript = transcriptParts.join(' ').replace(/\s+/g, ' ').trim();

    if (fullTranscript.length === 0) {
      throw new Error('Transcript is empty.');
    }

    return fullTranscript;
  }

  // Get transcript segments using new or legacy selectors
  function getTranscriptSegments() {
    const newSegments = document.querySelectorAll('transcript-segment-view-model');
    if (newSegments.length > 0) return newSegments;
    return document.querySelectorAll('ytd-transcript-segment-renderer');
  }

  // Extract caption text from a single segment, robust to YouTube class renames.
  // Modern (2025+): <span class="ytAttributedStringHost" role="text">text</span>
  // Legacy: <div class="segment-text">text</div>
  function extractSegmentText(segment, isNewLayout) {
    if (isNewLayout) {
      // Try selectors in order from most specific to most general so we keep
      // working when YouTube renames things.
      const selectors = [
        '.ytAttributedStringHost',
        '.yt-core-attributed-string',
        'span[role="text"]'
      ];
      for (const sel of selectors) {
        const el = segment.querySelector(sel);
        if (el) {
          const text = el.textContent.trim();
          if (text) return text;
        }
      }
      // Last resort: strip out timestamp nodes and take the rest. Keeps us
      // working even if YouTube changes every span class name.
      const clone = segment.cloneNode(true);
      clone.querySelectorAll(
        '.ytwTranscriptSegmentViewModelTimestamp,' +
        '.ytwTranscriptSegmentViewModelTimestampA11yLabel,' +
        '[class*="Timestamp"]'
      ).forEach(el => el.remove());
      return clone.textContent.trim();
    }
    const textElement = segment.querySelector('.segment-text');
    return textElement ? textElement.textContent.trim() : '';
  }

  // Poll for transcript segments to appear AND have extractable text. YouTube
  // creates the view-model elements and populates their caption text in two
  // separate render passes, so just checking for existence is a race.
  function pollForTranscriptSegments(timeout) {
    return new Promise((resolve) => {
      const deadline = Date.now() + timeout;
      function check() {
        const segments = getTranscriptSegments();
        if (segments.length > 0) {
          const isNewLayout = segments[0].tagName.toLowerCase() === 'transcript-segment-view-model';
          if (extractSegmentText(segments[0], isNewLayout)) {
            resolve(segments);
            return;
          }
        }
        if (Date.now() >= deadline) {
          resolve(segments); // resolve even if content never populated
          return;
        }
        setTimeout(check, 200);
      }
      check();
    });
  }

  // Open the transcript panel
  async function openTranscriptPanel() {
    const scrollY = window.scrollY;

    try {
      const moreButton = document.querySelector('#expand, tp-yt-paper-button#expand');
      if (moreButton) {
        moreButton.click();
        await sleep(500);
      }

      const showTranscriptButton = findShowTranscriptButton();

      if (showTranscriptButton) {
        showTranscriptButton.click();
        await sleep(1000);
        window.scrollTo(0, scrollY);
        return;
      }

      const transcriptButtonAlt = document.querySelector('button[aria-label*="transcript" i], button[aria-label*="Transcript" i]');
      if (transcriptButtonAlt) {
        transcriptButtonAlt.click();
        await sleep(1000);
        window.scrollTo(0, scrollY);
        return;
      }

      const menuButton = document.querySelector('#button-shape button, ytd-menu-renderer yt-button-shape button');
      if (menuButton) {
        menuButton.click();
        await sleep(500);

        const menuItems = document.querySelectorAll('ytd-menu-service-item-renderer, tp-yt-paper-item');
        for (const item of menuItems) {
          if (item.textContent.toLowerCase().includes('transcript')) {
            item.click();
            await sleep(1000);
            window.scrollTo(0, scrollY);
            return;
          }
        }
      }

      throw new Error('Could not find "Show transcript" button. Please manually click "Show transcript" under the video description.');
    } catch (error) {
      window.scrollTo(0, scrollY);
      throw error;
    }
  }

  // When a video has chapters, clicking "Show transcript" may open the
  // "In this video" panel (engagement-panel-macro-markers-description-chapters)
  // with Chapters/Transcript tabs, defaulting to Chapters. This function
  // finds and clicks the Transcript tab in whichever panel contains it.
  async function selectTranscriptTab() {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      // Search ALL engagement panels for Chapters/Transcript tab chips
      const panels = document.querySelectorAll('ytd-engagement-panel-section-list-renderer');
      let transcriptChip = null;
      for (const panel of panels) {
        const chips = panel.querySelectorAll('chip-view-model button, chip-shape button, button[role="tab"]');
        for (const chip of chips) {
          if (chip.textContent.trim() === 'Transcript') {
            transcriptChip = chip;
            break;
          }
        }
        if (transcriptChip) break;
      }
      if (transcriptChip) {
        if (transcriptChip.getAttribute('aria-selected') === 'true') return;
        transcriptChip.click();
        await sleep(500);
        return;
      }
      await sleep(200);
    }
  }

  // Find the "Show transcript" button
  function findShowTranscriptButton() {
    const buttons = document.querySelectorAll('ytd-video-description-transcript-section-renderer button, #description button, ytd-structured-description-content-renderer button');
    for (const btn of buttons) {
      if (btn.textContent.toLowerCase().includes('transcript')) {
        return btn;
      }
    }

    const allButtons = document.querySelectorAll('button, yt-button-shape, tp-yt-paper-button');
    for (const btn of allButtons) {
      if (btn.textContent.toLowerCase().includes('show transcript')) {
        return btn;
      }
    }

    return null;
  }

  // Wait for an element to appear
  function waitForElement(selector, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }

      const observer = new MutationObserver((mutations, obs) => {
        const el = document.querySelector(selector);
        if (el) {
          obs.disconnect();
          resolve(el);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Element ${selector} not found within ${timeout}ms`));
      }, timeout);
    });
  }

  // Sleep helper
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Gather YouTube metadata for content info
   * @returns {Object} - YouTube content info
   */
  function gatherMetadata() {
    const videoId = getVideoId();
    if (!videoId) return null;

    return {
      videoId: videoId,
      title: getVideoTitle(),
      description: getVideoDescription(),
      links: getDescriptionLinks()
    };
  }

  /**
   * Main extract function - called by base-extractor when sidebar requests content
   * @returns {Promise<Object>} - Extraction result with transcript and comments
   */
  async function extract() {
    const transcript = await extractTranscript();

    let commentsData = { creatorComments: [], viewerComments: [] };
    try {
      commentsData = await extractTopComments(20);
      console.log(`Extracted ${commentsData.creatorComments.length} creator comments, ${commentsData.viewerComments.length} viewer comments`);
    } catch (commentError) {
      console.log('Could not extract comments:', commentError.message);
    }

    return {
      success: true,
      transcript: transcript,
      creatorComments: commentsData.creatorComments,
      viewerComments: commentsData.viewerComments
    };
  }

  // Export the extractor
  window.__youtubeExtractor = {
    extract,
    gatherMetadata,
    getVideoId,
    getVideoTitle,
    getVideoDescription,
    getDescriptionLinks,
    extractTopComments,
    extractTranscript
  };
})();
