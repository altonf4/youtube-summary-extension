/**
 * Apple Reminders Integration
 * Creates reminders in Apple Reminders app using AppleScript
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

/**
 * Create reminders in Apple Reminders for action items
 * @param {Object} options - Options
 * @param {string} options.listName - Reminders list name (creates if doesn't exist)
 * @param {string} options.videoTitle - Video title for context
 * @param {string} options.videoUrl - Video URL for reminder body
 * @param {Array<{text: string, dueDate: string|null}>} options.actionItems - Action items to create
 * @returns {Promise<{success: boolean, count: number}>}
 */
async function createReminders({ listName, videoTitle, videoUrl, actionItems }) {
  if (!actionItems || actionItems.length === 0) {
    return { success: true, count: 0 };
  }

  try {
    // Ensure list exists
    await ensureRemindersList(listName);

    // Create each reminder
    let createdCount = 0;
    for (const item of actionItems) {
      await createReminder({
        listName,
        title: item.text,
        notes: `From video: ${videoTitle}\n${videoUrl}`,
        dueDate: item.dueDate
      });
      createdCount++;
    }

    return { success: true, count: createdCount };
  } catch (error) {
    throw new Error(`Failed to create reminders: ${error.message}`);
  }
}

/**
 * Ensure reminders list exists, create if it doesn't
 * @param {string} listName - List name to ensure exists
 */
async function ensureRemindersList(listName) {
  const escapedName = escapeForAppleScript(listName);
  const script = `
tell application "Reminders"
  set listExists to false
  repeat with aList in lists
    if name of aList is "${escapedName}" then
      set listExists to true
      exit repeat
    end if
  end repeat

  if not listExists then
    make new list with properties {name:"${escapedName}"}
  end if
end tell`;

  await runAppleScript(script);
}

/**
 * Create a single reminder
 * @param {Object} options
 * @param {string} options.listName - List name
 * @param {string} options.title - Reminder title
 * @param {string} options.notes - Reminder notes/body
 * @param {string|null} options.dueDate - ISO date string (YYYY-MM-DD) or null
 */
async function createReminder({ listName, title, notes, dueDate }) {
  const escapedListName = escapeForAppleScript(listName);
  const escapedTitle = escapeForAppleScript(title);
  const escapedNotes = escapeForAppleScript(notes);

  let dueDateProperty = '';
  if (dueDate) {
    // Parse ISO date and format for AppleScript (M/D/YYYY format)
    const [year, month, day] = dueDate.split('-').map(Number);
    dueDateProperty = `, due date:date "${month}/${day}/${year}"`;
  }

  const script = `
tell application "Reminders"
  tell list "${escapedListName}"
    make new reminder with properties {name:"${escapedTitle}", body:"${escapedNotes}"${dueDateProperty}}
  end tell
end tell`;

  await runAppleScript(script);
}

/**
 * List all reminder lists
 * @returns {Promise<string[]>} Array of list names
 */
async function listReminderLists() {
  const script = `
tell application "Reminders"
  set listNames to {}
  repeat with aList in lists
    set end of listNames to name of aList
  end repeat
  return listNames
end tell`;

  const result = await runAppleScript(script);
  // Result format: "list1, list2, list3"
  return result.split(', ').filter(name => name.length > 0);
}

/**
 * Run AppleScript command
 * @param {string} script - AppleScript code to execute
 * @returns {Promise<string>} Script output
 */
async function runAppleScript(script) {
  try {
    // Escape the entire script for shell
    const escapedScript = script.replace(/'/g, "'\\''");
    const { stdout, stderr } = await execAsync(`osascript -e '${escapedScript}'`);
    if (stderr && !stderr.includes('execution error')) {
      // Some warnings are OK, only throw on actual errors
    }
    return stdout.trim();
  } catch (error) {
    if (error.message.includes('Not authorized') || error.message.includes('-1743')) {
      throw new Error('Please grant permission to control Reminders in System Settings > Privacy & Security > Automation');
    }
    throw new Error(`AppleScript error: ${error.message}`);
  }
}

/**
 * Escape string for safe use in AppleScript
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeForAppleScript(str) {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

module.exports = {
  createReminders,
  listReminderLists
};
