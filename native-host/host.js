#!/usr/bin/env node

/**
 * Native Messaging Host for YouTube Summary Extension
 * Communicates with Chrome extension via stdin/stdout
 */

const fs = require('fs');
const path = require('path');
const claudeBridge = require('./claude-bridge');
const codexBridge = require('./codex-bridge');
const appleNotes = require('./apple-notes');
const appleReminders = require('./apple-reminders');
const logger = require('./logger');
const elevenlabs = require('./elevenlabs');
const { execSync } = require('child_process');

/**
 * Resolve which provider bridge to use based on the message.
 * Defaults to Claude for backwards compatibility with old extension builds.
 */
function getBridge(provider) {
  if (provider === 'codex') return codexBridge;
  return claudeBridge;
}

// Native messaging protocol uses length-prefixed messages
// Message format: [4 bytes: message length][message in JSON]

let messageBuffer = Buffer.alloc(0);
let messageLength = null;

// Read from stdin
process.stdin.on('data', (chunk) => {
  messageBuffer = Buffer.concat([messageBuffer, chunk]);
  processMessages();
});

process.stdin.on('end', () => {
  process.exit(0);
});

// Process messages from buffer
function processMessages() {
  while (true) {
    // Read message length (first 4 bytes)
    if (messageLength === null && messageBuffer.length >= 4) {
      messageLength = messageBuffer.readUInt32LE(0);
      messageBuffer = messageBuffer.slice(4);
    }

    // Read message body
    if (messageLength !== null && messageBuffer.length >= messageLength) {
      const messageBytes = messageBuffer.slice(0, messageLength);
      messageBuffer = messageBuffer.slice(messageLength);
      messageLength = null;

      try {
        const message = JSON.parse(messageBytes.toString('utf8'));
        handleMessage(message);
      } catch (error) {
        sendResponse({
          success: false,
          error: `Invalid message format: ${error.message}`
        });
      }
    } else {
      break;
    }
  }
}

// Handle incoming message
async function handleMessage(message) {
  const { action, requestId } = message;

  try {
    let response;

    switch (action) {
      case 'generateSummary':
        response = await handleGenerateSummary(message);
        break;

      case 'saveToNotes':
        response = await handleSaveToNotes(message);
        break;

      case 'listFolders':
        response = await handleListFolders();
        break;

      case 'followUp':
        response = await handleFollowUp(message);
        break;

      case 'chat':
        response = await handleChat(message);
        break;

      case 'generateAudio':
        response = await handleGenerateAudio(message);
        break;

      case 'listVoices':
        response = await handleListVoices(message);
        break;

      case 'checkAuth':
        response = await handleCheckAuth(message);
        break;

      default:
        response = {
          success: false,
          error: `Unknown action: ${action}`
        };
    }

    // Include requestId in response
    response.requestId = requestId;
    sendResponse(response);

  } catch (error) {
    sendResponse({
      requestId,
      success: false,
      error: error.message
    });
  }
}

// Handle generate summary action
async function handleGenerateSummary(message) {
  const { contentType, videoId, title, transcript, description, descriptionLinks, creatorComments, viewerComments, customInstructions, templateSections, requestId, model, author, siteName, publishDate, provider } = message;
  const bridge = getBridge(provider);

  if (!videoId && contentType === 'youtube_video') {
    return { success: false, error: 'Video ID is required' };
  }

  if (!transcript) {
    return { success: false, error: 'Content text is required' };
  }

  try {
    logDebug(`Received transcript: ${transcript.length} characters`);
    logDebug(`Creator comments: ${creatorComments?.length || 0}, Viewer comments: ${viewerComments?.length || 0}`);
    if (customInstructions) {
      logDebug('Using custom analysis instructions');
    }

    // Progress callback to send updates back to Chrome
    const onProgress = (progress) => {
      logDebug(`Progress: ${progress.stage} - ${progress.message}`);
      sendResponse({
        type: 'progress',
        requestId: requestId,
        progress: progress
      });
    };

    // Generate summary with selected provider
    logDebug(`Generating summary with provider=${provider || 'claude'}, model=${model || 'default'}`);
    logDebug(`Description length: ${description?.length || 0} chars, Links: ${descriptionLinks?.length || 0}`);
    const summaryResult = await bridge.generateSummary(title, transcript, description, descriptionLinks, creatorComments, viewerComments, customInstructions, onProgress, { model, contentType: contentType || 'youtube_video', author, siteName, publishDate, templateSections });

    if (!summaryResult.success) {
      return summaryResult;
    }

    logDebug('Summary generated successfully');

    return {
      success: true,
      summary: summaryResult.summary,
      keyLearnings: summaryResult.keyLearnings,
      actionItems: summaryResult.actionItems || [],
      relevantLinks: summaryResult.relevantLinks || []
    };

  } catch (error) {
    logDebug(`Error: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

// Handle save to Apple Notes action
async function handleSaveToNotes(message) {
  const { folder, videoTitle, videoUrl, summary, keyLearnings, relevantLinks, actionItems, customNotes, noteId, reminderIds } = message;

  if (!folder || !videoTitle || !summary) {
    return {
      success: false,
      error: 'Missing required fields for saving to Notes'
    };
  }

  try {
    logDebug(`Saving to Apple Notes folder: ${folder}${noteId ? ` (noteId: ${noteId})` : ''}`);

    // Save to Apple Notes
    const noteResult = await appleNotes.saveNote({
      folder,
      title: videoTitle,
      url: videoUrl,
      summary,
      keyLearnings,
      relevantLinks: relevantLinks || [],
      actionItems: actionItems || [],
      customNotes,
      noteId
    });

    const action = noteResult.created ? 'Created' : 'Updated';
    logDebug(`${action} note in Apple Notes successfully (noteId: ${noteResult.noteId})`);

    // Create/update reminders if action items exist (or delete old ones if no items)
    let remindersResult = { success: true, count: 0, reminderIds: [] };
    const hasExistingReminders = reminderIds && reminderIds.length > 0;
    const hasActionItems = actionItems && actionItems.length > 0;

    if (hasActionItems || hasExistingReminders) {
      logDebug(`Managing reminders: ${hasExistingReminders ? `deleting ${reminderIds.length} old, ` : ''}creating ${actionItems?.length || 0} new`);
      try {
        remindersResult = await appleReminders.createReminders({
          listName: folder,  // Use same folder name for reminders list
          videoTitle,
          videoUrl,
          actionItems: actionItems || [],
          existingReminderIds: reminderIds || []
        });
        logDebug(`Reminders updated: ${remindersResult.count} created`);
      } catch (reminderError) {
        // Don't fail the whole operation if reminders fail
        logDebug(`Warning: Failed to manage reminders: ${reminderError.message}`);
      }
    }

    return {
      success: true,
      created: noteResult.created,
      noteId: noteResult.noteId,
      remindersCreated: remindersResult.count,
      reminderIds: remindersResult.reminderIds || [],
      message: `${action} note in "${folder}"${remindersResult.count > 0 ? ` and ${hasExistingReminders ? 'updated' : 'created'} ${remindersResult.count} reminder${remindersResult.count > 1 ? 's' : ''}` : ''}`
    };

  } catch (error) {
    logDebug(`Error saving to Notes: ${error.message}`);
    return {
      success: false,
      error: `Failed to save to Apple Notes: ${error.message}`
    };
  }
}

// Handle list folders action
async function handleListFolders() {
  try {
    logDebug('Fetching Apple Notes folders...');
    const folders = await appleNotes.listFolders();
    logDebug(`Found ${folders.length} folders`);

    return {
      success: true,
      folders: folders
    };
  } catch (error) {
    logDebug(`Error listing folders: ${error.message}`);
    return {
      success: false,
      error: `Failed to list folders: ${error.message}`
    };
  }
}

// Handle follow-up query action
async function handleFollowUp(message) {
  const { videoId, title, transcript, query, existingLearnings, model, provider } = message;
  const bridge = getBridge(provider);

  if (!transcript) {
    return { success: false, error: 'Transcript is required' };
  }

  if (!query) {
    return { success: false, error: 'Query is required' };
  }

  try {
    logDebug(`Processing follow-up query (provider=${provider || 'claude'}): ${query.substring(0, 50)}...`);
    logDebug(`Existing learnings: ${existingLearnings.length}`);

    const result = await bridge.generateFollowUp(title, transcript, query, existingLearnings, { model });

    if (!result.success) {
      return result;
    }

    logDebug(`Follow-up generated: ${(result.insights || []).length} insights, ${(result.actions || []).length} actions`);

    return {
      success: true,
      insights: result.insights || [],
      actions: result.actions || [],
      additionalLearnings: result.insights || [] // backward compat
    };

  } catch (error) {
    logDebug(`Error in follow-up: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Handle multi-turn chat. The extension passes the full conversation context
 * (source material + summary + learnings + comments + every prior message)
 * each call — the CLI is one-shot, so we serialize history into one prompt
 * here and return Claude/Codex's reply verbatim.
 */
async function handleChat(message) {
  const {
    title,
    url,
    contentType,
    transcript,
    summary,
    keyLearnings,
    actionItems,
    creatorComments,
    viewerComments,
    messages,
    model,
    provider
  } = message;

  if (!Array.isArray(messages) || messages.length === 0) {
    return { success: false, error: 'At least one chat message is required' };
  }

  const bridge = getBridge(provider);
  const prompt = buildChatPrompt({
    title,
    url,
    contentType,
    transcript,
    summary,
    keyLearnings,
    actionItems,
    creatorComments,
    viewerComments,
    messages
  });

  try {
    logDebug(`Chat (provider=${provider || 'claude'}, model=${model || 'default'}, turns=${messages.length}, prompt=${prompt.length} chars)`);
    const result = await bridge.chat(prompt, { model });
    if (!result.success) return result;
    return { success: true, reply: result.reply };
  } catch (error) {
    logDebug(`Error in chat: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Serialize the full conversation context into a single prompt string.
 * Order: system instructions → source material → generated artifacts → comments → conversation history.
 */
function buildChatPrompt({ title, url, contentType, transcript, summary, keyLearnings, actionItems, creatorComments, viewerComments, messages }) {
  // Truncate transcript to keep prompt within reasonable bounds.
  const MAX_TRANSCRIPT = 50000;
  const truncatedTranscript = transcript && transcript.length > MAX_TRANSCRIPT
    ? transcript.substring(0, MAX_TRANSCRIPT) + '...[truncated]'
    : (transcript || '');

  const sourceLabel = contentType === 'article' ? 'article'
    : contentType === 'webpage' ? 'web page'
    : contentType === 'selected_text' ? 'selected text'
    : 'video transcript';

  let prompt = `You are an assistant helping the user explore and understand a piece of content they've already summarized. Answer their questions using the source material below as your primary source of truth. When the source doesn't cover something, say so plainly rather than guessing.

Format responses as natural prose with markdown when it helps readability (lists, code blocks, **bold**). Keep answers focused and skimmable. Quote the source when it strengthens your answer.

`;

  prompt += `## Content Metadata\n`;
  if (title) prompt += `Title: ${title}\n`;
  if (url) prompt += `URL: ${url}\n`;
  prompt += `Type: ${sourceLabel}\n\n`;

  if (summary) {
    prompt += `## Generated Summary\n${summary}\n\n`;
  }

  if (Array.isArray(keyLearnings) && keyLearnings.length > 0) {
    prompt += `## Key Learnings (already extracted)\n`;
    keyLearnings.forEach((l) => { prompt += `- ${l}\n`; });
    prompt += `\n`;
  }

  if (Array.isArray(actionItems) && actionItems.length > 0) {
    prompt += `## Action Items (already extracted)\n`;
    actionItems.forEach((a) => { prompt += `- ${a}\n`; });
    prompt += `\n`;
  }

  if (Array.isArray(creatorComments) && creatorComments.length > 0) {
    const valid = creatorComments.filter((c) => c && c.text && c.text.length >= 15);
    if (valid.length > 0) {
      prompt += `## Creator Comments\n`;
      valid.forEach((c, i) => { prompt += `${i + 1}. "${c.text}"\n`; });
      prompt += `\n`;
    }
  }

  if (Array.isArray(viewerComments) && viewerComments.length > 0) {
    const useful = viewerComments
      .filter((c) => c && c.text && c.text.length >= 30 && (c.likes || 0) >= 10)
      .slice(0, 10);
    if (useful.length > 0) {
      prompt += `## Top Viewer Comments (use cautiously — may include jokes)\n`;
      useful.forEach((c, i) => { prompt += `${i + 1}. [${c.likes} likes] "${c.text}"\n`; });
      prompt += `\n`;
    }
  }

  if (truncatedTranscript) {
    prompt += `## Source Material (${sourceLabel})\n${truncatedTranscript}\n\n`;
  }

  prompt += `## Conversation\n`;
  // All but the final message are history; the final one is what we answer now.
  messages.forEach((m, i) => {
    const role = m.role === 'assistant' ? 'Assistant' : 'User';
    const isLast = i === messages.length - 1;
    if (isLast && m.role === 'user') {
      prompt += `\n${role} (current question): ${m.content}\n`;
    } else {
      prompt += `\n${role}: ${m.content}\n`;
    }
  });

  prompt += `\nRespond as the assistant. Reply only with the response — do not prefix with "Assistant:" or include the user's message.`;

  return prompt;
}

// Handle generate audio action
async function handleGenerateAudio(message) {
  const { text, voiceId, apiKey } = message;

  if (!text) {
    return { success: false, error: 'Text is required' };
  }

  if (!voiceId) {
    return { success: false, error: 'Voice ID is required' };
  }

  if (!apiKey) {
    return { success: false, error: 'API key is required' };
  }

  try {
    logDebug(`Generating audio: ${text.length} chars with voice ${voiceId}`);
    const result = await elevenlabs.generateSpeech(text, voiceId, apiKey);

    if (result.success) {
      const audioSizeKB = Math.round((result.audioSizeBytes || 0) / 1024);
      const base64SizeKB = Math.round((result.audio?.length || 0) / 1024);
      logDebug(`Audio generated: ${audioSizeKB}KB raw, ${base64SizeKB}KB base64`);
      // Chrome native messaging has 1MB limit, warn if close
      if (base64SizeKB > 900) {
        logDebug('WARNING: Audio size approaching 1MB native messaging limit');
      }
    } else {
      logDebug(`Audio generation failed: ${result.error}`);
    }

    return result;
  } catch (error) {
    logDebug(`Error generating audio: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Handle list voices action
async function handleListVoices(message) {
  const { apiKey } = message;

  if (!apiKey) {
    return { success: false, error: 'API key is required' };
  }

  try {
    logDebug('Fetching ElevenLabs voices...');
    const result = await elevenlabs.listVoices(apiKey);

    if (result.success) {
      logDebug(`Found ${result.voices.length} voices`);
    } else {
      logDebug(`Failed to fetch voices: ${result.error}`);
    }

    return result;
  } catch (error) {
    logDebug(`Error fetching voices: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Handle check auth action - reports availability for each supported provider
async function handleCheckAuth(message) {
  try {
    logDebug('Checking CLI auth status...');

    let claudeAvailable = false;
    try {
      execSync('which claude 2>/dev/null || test -f ~/.claude/local/claude', { timeout: 3000 });
      claudeAvailable = true;
    } catch {
      // not installed
    }

    const codexAvailable = !!codexBridge.findCodexCommand();
    const codexLoggedIn = codexBridge.isLoggedIn();

    logDebug(`Auth status: claude=${claudeAvailable} codex=${codexAvailable && codexLoggedIn}`);

    return {
      success: true,
      // Legacy fields for backwards compatibility with the old settings UI.
      authMethod: claudeAvailable ? 'cli' : 'none',
      available: claudeAvailable,
      providers: {
        claude: { available: claudeAvailable },
        codex: { available: codexAvailable, loggedIn: codexLoggedIn }
      }
    };
  } catch (error) {
    logDebug(`Error checking auth: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Send response to Chrome
function sendResponse(response) {
  const message = JSON.stringify(response);
  const messageBytes = Buffer.from(message, 'utf8');
  const lengthBytes = Buffer.alloc(4);
  lengthBytes.writeUInt32LE(messageBytes.length, 0);

  process.stdout.write(lengthBytes);
  process.stdout.write(messageBytes);
}

// Debug logging to file (since stdout is used for messaging)
function logDebug(message) {
  logger.log(message);
}

// Log startup
logDebug('Native messaging host started');

// Keep process alive
process.stdin.resume();
