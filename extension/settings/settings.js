// Default analysis instructions (user-customizable part)
const DEFAULT_INSTRUCTIONS = `Analyze this YouTube video and extract the most valuable insights.

Focus on:
- Main arguments and conclusions
- Actionable advice and recommendations
- Interesting facts or statistics mentioned
- Key concepts explained

Make the summary engaging and the learnings practical.`;

// DOM Elements
const promptTextarea = document.getElementById('prompt-template');
const saveBtn = document.getElementById('save-btn');
const resetBtn = document.getElementById('reset-prompt-btn');
const saveStatus = document.getElementById('save-status');
const remindersCheckedCheckbox = document.getElementById('reminders-checked-default');

// Load settings on page load
async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get(['analysisInstructions', 'remindersCheckedByDefault']);
    promptTextarea.value = result.analysisInstructions || DEFAULT_INSTRUCTIONS;
    // Default to true (checked) if not set
    remindersCheckedCheckbox.checked = result.remindersCheckedByDefault !== false;
  } catch (error) {
    console.error('Error loading settings:', error);
    promptTextarea.value = DEFAULT_INSTRUCTIONS;
    remindersCheckedCheckbox.checked = true;
  }
}

// Save settings
async function saveSettings() {
  try {
    await chrome.storage.sync.set({
      analysisInstructions: promptTextarea.value,
      remindersCheckedByDefault: remindersCheckedCheckbox.checked
    });

    // Show save status
    saveStatus.textContent = 'Settings saved!';
    saveStatus.classList.add('visible');

    setTimeout(() => {
      saveStatus.classList.remove('visible');
    }, 3000);
  } catch (error) {
    console.error('Error saving settings:', error);
    saveStatus.textContent = 'Error saving settings';
    saveStatus.classList.add('visible');
    saveStatus.style.color = '#ef4444';
  }
}

// Reset to default
function resetPrompt() {
  if (confirm('Reset to default instructions?')) {
    promptTextarea.value = DEFAULT_INSTRUCTIONS;
    saveSettings();
  }
}

// Handle example button clicks
function setupExampleButtons() {
  const exampleBtns = document.querySelectorAll('.example-btn');
  exampleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const prompt = btn.getAttribute('data-prompt');
      promptTextarea.value = prompt;
      // Highlight the textarea briefly
      promptTextarea.style.borderColor = '#667eea';
      promptTextarea.style.boxShadow = '0 0 0 3px rgba(102, 126, 234, 0.2)';
      setTimeout(() => {
        promptTextarea.style.borderColor = '';
        promptTextarea.style.boxShadow = '';
      }, 1000);
    });
  });
}

// Event listeners
saveBtn.addEventListener('click', saveSettings);
resetBtn.addEventListener('click', resetPrompt);

// Keyboard shortcut to save (Ctrl/Cmd + S)
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    saveSettings();
  }
});

// Initialize
loadSettings();
setupExampleButtons();
