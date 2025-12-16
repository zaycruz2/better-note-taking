import test from 'node:test';
import assert from 'node:assert/strict';

import { addEventTaskToContent, extractEventName, normalizeEventLineForMatch } from '../utils/eventTasks.ts';

test('addEventTaskToContent adds subtask under event in single date block', () => {
  const date = '2025-12-16';
  const content = [
    date,
    '========================================',
    '[EVENTS]',
    '02:30 PM - Team Meeting',
    '',
    '[DOING]',
    '',
    '[DONE]',
    '',
    '[NOTES]',
    ''
  ].join('\n');

  const result = addEventTaskToContent({
    content,
    dateStr: date,
    eventRawLine: '02:30 PM - Team Meeting',
    taskName: 'Prepare slides'
  });

  // Check subtask is added under event
  assert.match(result, /02:30 PM - Team Meeting\n  - Prepare slides/);
  // Check item is added to DOING
  assert.match(result, /\[DOING\]\n- Prepare slides/);
});

test('addEventTaskToContent finds event in second of duplicate date blocks', () => {
  const date = '2025-12-16';
  // Simulate duplicate date blocks - event only exists in second block
  const content = [
    date,
    '========================================',
    '[EVENTS]',
    '',
    '[DOING]',
    '',
    '[DONE]',
    '',
    '[NOTES]',
    '',
    '',
    date,
    '========================================',
    '[EVENTS]',
    '02:30 PM - Team Meeting',
    '04:00 PM - Daily Standup',
    '',
    '[DOING]',
    '',
    '[DONE]',
    '',
    '[NOTES]',
    ''
  ].join('\n');

  const result = addEventTaskToContent({
    content,
    dateStr: date,
    eventRawLine: '02:30 PM - Team Meeting',
    taskName: 'Prepare slides'
  });

  // Check subtask is added under event (should find it in second block)
  assert.match(result, /02:30 PM - Team Meeting\n  - Prepare slides/);
  // Check item is added to DOING
  assert.match(result, /\[DOING\]\n- Prepare slides/);
});

test('addEventTaskToContent uses normalized matching for event lines', () => {
  const date = '2025-12-16';
  const content = [
    date,
    '========================================',
    '[EVENTS]',
    '02:30 PM - Team Meeting',
    '',
    '[DOING]',
    '',
    '[DONE]',
    '',
    '[NOTES]',
    ''
  ].join('\n');

  // Pass event line with slightly different whitespace
  const result = addEventTaskToContent({
    content,
    dateStr: date,
    eventRawLine: '  02:30 PM - Team Meeting  ',
    taskName: 'Prepare slides'
  });

  // Should still find and add subtask
  assert.match(result, /02:30 PM - Team Meeting\n  - Prepare slides/);
});

test('extractEventName removes time prefix', () => {
  assert.equal(extractEventName('02:30 PM - Team Meeting'), 'Team Meeting');
  assert.equal(extractEventName('10:00 AM - Daily Standup'), 'Daily Standup');
  assert.equal(extractEventName('All Day - Holiday'), 'Holiday');
  assert.equal(extractEventName('No Time Event'), 'No Time Event');
});

test('normalizeEventLineForMatch handles various formats', () => {
  const norm = normalizeEventLineForMatch;
  assert.equal(norm('02:30 PM - Meeting'), '02:30 pm - meeting');
  assert.equal(norm('  x 02:30 PM - Meeting  '), '02:30 pm - meeting');
  assert.equal(norm('- Some Task'), 'some task');
});
