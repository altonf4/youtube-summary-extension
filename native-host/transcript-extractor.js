/**
 * YouTube Transcript Extractor
 * Fetches transcripts from YouTube videos
 */

const { YoutubeTranscript } = require('youtube-transcript');

/**
 * Get transcript for a YouTube video
 * @param {string} videoId - YouTube video ID
 * @returns {Promise<string>} - Transcript text
 */
async function getTranscript(videoId) {
  try {
    const transcriptItems = await YoutubeTranscript.fetchTranscript(videoId);

    if (!transcriptItems || transcriptItems.length === 0) {
      throw new Error('No transcript available for this video');
    }

    // Combine all transcript segments into one text
    const transcriptText = transcriptItems
      .map(item => item.text)
      .join(' ')
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    return transcriptText;

  } catch (error) {
    // Handle specific errors
    if (error.message.includes('disabled')) {
      throw new Error('Transcripts are disabled for this video');
    } else if (error.message.includes('unavailable')) {
      throw new Error('No transcript available for this video');
    } else {
      throw new Error(`Failed to fetch transcript: ${error.message}`);
    }
  }
}

module.exports = {
  getTranscript
};
