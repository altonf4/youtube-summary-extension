/**
 * Apple Notes Integration
 * Creates notes in Apple Notes using AppleScript
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

/**
 * Save a note to Apple Notes
 * @param {Object} options - Note options
 * @param {string} options.folder - Folder name
 * @param {string} options.title - Video title
 * @param {string} options.url - Video URL
 * @param {string} options.summary - Summary text
 * @param {Array<string>} options.keyLearnings - Key learnings array
 * @param {string} options.customNotes - Custom notes HTML
 * @returns {Promise<void>}
 */
async function saveNote({ folder, title, url, summary, keyLearnings, customNotes }) {
  try {
    // Ensure folder exists
    await ensureFolder(folder);

    // Format the note content
    const noteBody = formatNoteContent(title, url, summary, keyLearnings, customNotes);

    // Create the note
    await createNote(folder, title, noteBody);

  } catch (error) {
    throw new Error(`Failed to save to Apple Notes: ${error.message}`);
  }
}

/**
 * Ensure folder exists in Apple Notes
 * @param {string} folderName - Folder name
 * @returns {Promise<void>}
 */
async function ensureFolder(folderName) {
  const script = `
    tell application "Notes"
      set folderExists to false
      repeat with aFolder in folders
        if name of aFolder is "${escapeForAppleScript(folderName)}" then
          set folderExists to true
          exit repeat
        end if
      end repeat

      if not folderExists then
        make new folder with properties {name:"${escapeForAppleScript(folderName)}"}
      end if
    end tell
  `;

  await runAppleScript(script);
}

/**
 * Create note in Apple Notes
 * @param {string} folderName - Folder name
 * @param {string} noteTitle - Note title
 * @param {string} noteBody - Note body (HTML)
 * @returns {Promise<void>}
 */
async function createNote(folderName, noteTitle, noteBody) {
  const script = `
    tell application "Notes"
      tell folder "${escapeForAppleScript(folderName)}"
        make new note with properties {name:"${escapeForAppleScript(noteTitle)}", body:"${escapeForAppleScript(noteBody)}"}
      end tell
    end tell
  `;

  await runAppleScript(script);
}

/**
 * Format note content as HTML
 * @param {string} title - Video title
 * @param {string} url - Video URL
 * @param {string} summary - Summary text
 * @param {Array<string>} keyLearnings - Key learnings
 * @param {string} customNotes - Custom notes HTML
 * @returns {string} - Formatted HTML
 */
function formatNoteContent(title, url, summary, keyLearnings, customNotes) {
  const date = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const learningsList = keyLearnings
    .map(learning => `<li>${escapeHtml(learning)}</li>`)
    .join('\n');

  // Build custom notes section if provided
  const customNotesSection = customNotes ? `
<br>
<h2>My Notes</h2>
<div>${customNotes}</div>` : '';

  return `
<div>
<h1>${escapeHtml(title)}</h1>
<p><b>URL:</b> <a href="${url}">${url}</a></p>
<p><b>Saved:</b> ${date}</p>
<br>
<h2>Summary</h2>
<p>${escapeHtml(summary).replace(/\n/g, '<br>')}</p>
<br>
<h2>Key Learnings</h2>
<ul>
${learningsList}
</ul>
${customNotesSection}
<br>
<p style="color: #888; font-size: 12px;">Generated with Claude Code</p>
</div>
  `.trim();
}

/**
 * Run AppleScript
 * @param {string} script - AppleScript code
 * @returns {Promise<string>} - Script output
 */
async function runAppleScript(script) {
  try {
    const { stdout, stderr } = await execAsync(`osascript -e '${script}'`);

    if (stderr) {
      throw new Error(stderr);
    }

    return stdout.trim();

  } catch (error) {
    // Check for specific errors
    if (error.message.includes('Not authorized')) {
      throw new Error('Please grant permission to control Apple Notes in System Settings > Privacy & Security > Automation');
    } else if (error.message.includes('not running')) {
      throw new Error('Please open Apple Notes app and try again');
    } else {
      throw new Error(`AppleScript error: ${error.message}`);
    }
  }
}

/**
 * Escape string for AppleScript
 * @param {string} str - String to escape
 * @returns {string} - Escaped string
 */
function escapeForAppleScript(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

/**
 * Escape HTML special characters
 * @param {string} str - String to escape
 * @returns {string} - Escaped string
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * List all folders in Apple Notes
 * @returns {Promise<Array<string>>} - Folder names
 */
async function listFolders() {
  const script = `
    tell application "Notes"
      set folderList to {}
      repeat with aFolder in folders
        set end of folderList to name of aFolder
      end repeat
      return folderList
    end tell
  `;

  const result = await runAppleScript(script);
  return result.split(', ').filter(name => name.length > 0);
}

module.exports = {
  saveNote,
  ensureFolder,
  listFolders
};
