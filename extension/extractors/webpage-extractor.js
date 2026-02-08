/**
 * Webpage Extractor
 * Fallback extractor for non-article pages
 * Extracts document.body.innerText with basic cleanup
 */

(function() {
  /**
   * Extract page content
   * @returns {Promise<Object>} - Extraction result
   */
  async function extract() {
    const text = extractPageText();

    if (!text || text.length < 100) {
      throw new Error('Not enough text content on this page to summarize.');
    }

    return {
      success: true,
      transcript: text,
      creatorComments: [],
      viewerComments: []
    };
  }

  /**
   * Extract text from the page body, removing non-content elements
   * @returns {string}
   */
  function extractPageText() {
    const body = document.body.cloneNode(true);

    // Remove non-content elements
    const removeSelectors = [
      'nav', 'header', 'footer', 'aside',
      '.sidebar', '.navigation', '.menu',
      '.ad', '.advertisement', '.banner',
      '.social-share', '.comments',
      'script', 'style', 'noscript', 'iframe',
      '[role="navigation"]', '[role="banner"]', '[role="complementary"]'
    ];

    removeSelectors.forEach(selector => {
      body.querySelectorAll(selector).forEach(el => el.remove());
    });

    const text = body.innerText || '';

    return text
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\t+/g, ' ')
      .replace(/ {2,}/g, ' ')
      .trim();
  }

  window.__webpageExtractor = {
    extract,
    extractPageText
  };
})();
