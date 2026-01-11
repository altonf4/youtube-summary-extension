#!/usr/bin/env node

/**
 * Native Messaging Host for YouTube Summary Extension
 * Communicates with Chrome extension via stdin/stdout
 */

const fs = require('fs');
const path = require('path');
const claudeBridge = require('./claude-bridge');
const appleNotes = require('./apple-notes');
const appleReminders = require('./apple-reminders');
const logger = require('./logger');

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
  const { videoId, title, transcript, description, descriptionLinks, creatorComments, viewerComments, customInstructions, requestId } = message;

  if (!videoId) {
    return { success: false, error: 'Video ID is required' };
  }

  if (!transcript) {
    return { success: false, error: 'Transcript is required' };
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

    // Generate summary with Claude
    logDebug('Generating summary with Claude Code...');
    logDebug(`Description length: ${description?.length || 0} chars, Links: ${descriptionLinks?.length || 0}`);
    const summaryResult = await claudeBridge.generateSummary(title, transcript, description, descriptionLinks, creatorComments, viewerComments, customInstructions, onProgress);

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
  const { folder, videoTitle, videoUrl, summary, keyLearnings, relevantLinks, actionItems, customNotes, noteId } = message;

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

    // Create reminders if action items exist
    let remindersResult = { success: true, count: 0 };
    if (actionItems && actionItems.length > 0) {
      logDebug(`Creating ${actionItems.length} reminders in Apple Reminders...`);
      try {
        remindersResult = await appleReminders.createReminders({
          listName: folder,  // Use same folder name for reminders list
          videoTitle,
          videoUrl,
          actionItems
        });
        logDebug(`Created ${remindersResult.count} reminders successfully`);
      } catch (reminderError) {
        // Don't fail the whole operation if reminders fail
        logDebug(`Warning: Failed to create reminders: ${reminderError.message}`);
      }
    }

    return {
      success: true,
      created: noteResult.created,
      noteId: noteResult.noteId,
      remindersCreated: remindersResult.count,
      message: `${action} note in "${folder}"${remindersResult.count > 0 ? ` and created ${remindersResult.count} reminder${remindersResult.count > 1 ? 's' : ''}` : ''}`
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
  const { videoId, title, transcript, query, existingLearnings } = message;

  if (!transcript) {
    return { success: false, error: 'Transcript is required' };
  }

  if (!query) {
    return { success: false, error: 'Query is required' };
  }

  try {
    logDebug(`Processing follow-up query: ${query.substring(0, 50)}...`);
    logDebug(`Existing learnings: ${existingLearnings.length}`);

    // Generate follow-up with Claude
    const result = await claudeBridge.generateFollowUp(title, transcript, query, existingLearnings);

    if (!result.success) {
      return result;
    }

    logDebug(`Follow-up generated: ${result.additionalLearnings.length} new learnings`);

    return {
      success: true,
      additionalLearnings: result.additionalLearnings
    };

  } catch (error) {
    logDebug(`Error in follow-up: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
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
