/**
 * Selection Extractor
 * Extracts selected text from the page
 * Triggered via context menu "Summarize with Claude"
 */

(function() {
  /**
   * Extract selected text
   * @returns {Promise<Object>} - Extraction result
   */
  async function extract() {
    const info = window.__contentSummaryInfo || {};
    const selectedText = info.selectedText || window.getSelection().toString();

    if (!selectedText || selectedText.trim().length < 20) {
      throw new Error('Please select more text to summarize (at least a few sentences).');
    }

    return {
      success: true,
      transcript: selectedText.trim(),
      creatorComments: [],
      viewerComments: []
    };
  }

  window.__selectionExtractor = {
    extract
  };
})();
