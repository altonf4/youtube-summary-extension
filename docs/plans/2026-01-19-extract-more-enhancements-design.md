# Extract More Enhancements - Design Document

**Date**: 2026-01-19
**Status**: Approved

## Overview

Enhance the "Extract More" feature with:
1. Tooltip/helper text explaining the feature
2. Dynamic AI response routing (insights vs action items based on query)
3. Manual add/remove buttons for Key Learnings and Action Items

## Requirements

### 1. Tooltip for "Extract More"
- Add info icon (ⓘ) next to "Extract More" header
- Hover shows: "Ask Claude to extract additional insights or action items from the video based on your question."
- CSS-only implementation using `::after` pseudo-element

### 2. Dynamic AI Response Routing

**Response Format**: Structured JSON for extensibility (future MCP server compatibility)

```json
{
  "items": [
    { "type": "insight", "text": "The speaker recommends using TypeScript for better type safety" },
    { "type": "action", "text": "Try implementing a simple TypeScript project to practice" }
  ]
}
```

**Classification Rules for Claude**:
- **insight**: Facts, concepts, statistics, explanations, observations from the video
- **action**: Concrete tasks starting with verbs (Try, Implement, Research, Practice, Build, etc.)

**Routing Logic**:
- `type: "insight"` → append to Key Learnings section
- `type: "action"` → append to Action Items section

### 3. Manual Add/Remove UI

**Delete Button (per item)**:
- Small × icon on right side of each learning/action item
- Visible on row hover, faded otherwise
- Click removes item immediately (no confirmation)

**Add Button (section footer)**:
- "+ Add Learning" button at bottom of Key Learnings section
- "+ Add Action Item" button at bottom of Action Items section
- Creates new empty item, checked by default
- Auto-focuses textarea for immediate typing

## Technical Implementation

### Files to Modify

1. **`native-host/claude-bridge.js`**
   - Update `createFollowUpPrompt()` to request JSON output
   - Add classification guidance (insight vs action)
   - Update `parseFollowUpResponse()` to parse JSON with fallback

2. **`extension/sidebar/sidebar.html`**
   - Add tooltip markup to "Extract More" header
   - Add delete button to learning-item and action-item templates
   - Add "+ Add" buttons to both sections

3. **`extension/sidebar/sidebar.js`**
   - Update `handleFollowUp()` to route items by type
   - Add `appendNewActionItems()` function (similar to `appendNewLearnings()`)
   - Add `deleteItem()` handler for remove buttons
   - Add `addNewLearning()` and `addNewActionItem()` handlers

4. **`extension/sidebar/styles.css`**
   - Tooltip styles (info icon + hover popup)
   - Delete button styles (positioned right, visible on hover)
   - Add button styles (centered, subtle)

### Prompt Changes

```
Based on the transcript, extract additional information that answers the user's question.

IMPORTANT: Classify each item as either an "insight" or "action":
- insight: Facts, concepts, statistics, explanations, or observations from the video
- action: Concrete tasks the viewer should do (start with verbs like Try, Implement, Research, etc.)

Return your response as JSON in this exact format:
{
  "items": [
    { "type": "insight", "text": "Your insight here" },
    { "type": "action", "text": "Your action item here" }
  ]
}

Only include information actually mentioned or directly inferable from the transcript.
```

### JSON Parsing Strategy

```javascript
function parseFollowUpResponse(response) {
  // Try to extract JSON from response (handle markdown code blocks)
  const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) ||
                    response.match(/\{[\s\S]*"items"[\s\S]*\}/);

  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      if (parsed.items && Array.isArray(parsed.items)) {
        return {
          insights: parsed.items.filter(i => i.type === 'insight').map(i => i.text),
          actions: parsed.items.filter(i => i.type === 'action').map(i => i.text)
        };
      }
    } catch (e) {
      // Fall through to fallback
    }
  }

  // Fallback: treat all as insights (existing behavior)
  return {
    insights: parseAsPlainText(response),
    actions: []
  };
}
```

## UI Mockups

### Tooltip
```
Extract More ⓘ ←─ hover shows tooltip
             ┌────────────────────────────────────────┐
             │ Ask Claude to extract additional       │
             │ insights or action items from the      │
             │ video based on your question.          │
             └────────────────────────────────────────┘
```

### Item with Delete Button
```
┌─────────────────────────────────────────────────────────┐
│ ☑ The speaker recommends TypeScript for safety      [×] │
└─────────────────────────────────────────────────────────┘
     ↑ checkbox    ↑ editable textarea           ↑ delete (hover)
```

### Section with Add Button
```
┌─────────────────────────────────────────────────────────┐
│ Key Learnings (click to edit)              [Select All] │
├─────────────────────────────────────────────────────────┤
│ ☑ First learning...                                 [×] │
│ ☑ Second learning...                                [×] │
├─────────────────────────────────────────────────────────┤
│                    [+ Add Learning]                     │
└─────────────────────────────────────────────────────────┘
```

## Testing Checklist

- [ ] Tooltip appears on hover over info icon
- [ ] Follow-up with insight-focused query adds to Key Learnings
- [ ] Follow-up with action-focused query adds to Action Items
- [ ] Follow-up with mixed query splits appropriately
- [ ] JSON parsing handles markdown code blocks
- [ ] Fallback works when JSON parsing fails
- [ ] Delete button removes item from list
- [ ] Delete button visible on hover, hidden otherwise
- [ ] Add Learning creates new empty learning item
- [ ] Add Action Item creates new empty action item
- [ ] New items are checked by default
- [ ] New item textarea is auto-focused
- [ ] Items survive save to Apple Notes correctly
