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
 * @param {Array<string>} options.existingReminderIds - IDs of previously created reminders to delete first
 * @returns {Promise<{success: boolean, count: number, reminderIds: string[]}>}
 */
async function createReminders({ listName, videoTitle, videoUrl, actionItems, existingReminderIds = [] }) {
  // Delete existing reminders first if we have cached IDs
  if (existingReminderIds && existingReminderIds.length > 0) {
    await deleteReminders(existingReminderIds);
  }

  if (!actionItems || actionItems.length === 0) {
    return { success: true, count: 0, reminderIds: [] };
  }

  try {
    // Ensure list exists
    await ensureRemindersList(listName);

    // Create each reminder and collect IDs
    const reminderIds = [];
    for (const item of actionItems) {
      const reminderId = await createReminder({
        listName,
        title: item.text,
        notes: `From video: ${videoTitle}\n${videoUrl}`,
        dueDate: item.dueDate
      });
      if (reminderId) {
        reminderIds.push(reminderId);
      }
    }

    return { success: true, count: reminderIds.length, reminderIds };
  } catch (error) {
    throw new Error(`Failed to create reminders: ${error.message}`);
  }
}

/**
 * Delete reminders by their IDs
 * @param {string[]} reminderIds - Array of reminder IDs to delete
 */
async function deleteReminders(reminderIds) {
  if (!reminderIds || reminderIds.length === 0) return;

  for (const reminderId of reminderIds) {
    try {
      const script = `
tell application "Reminders"
  try
    delete (first reminder whose id is "${escapeForAppleScript(reminderId)}")
  end try
end tell`;
      await runAppleScript(script);
    } catch (error) {
      // Ignore errors for individual deletions (reminder may already be deleted)
    }
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
 * @returns {Promise<string|null>} Reminder ID or null
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
    set newReminder to make new reminder with properties {name:"${escapedTitle}", body:"${escapedNotes}"${dueDateProperty}}
    return id of newReminder
  end tell
end tell`;

  const result = await runAppleScript(script);
  return result || null;
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
