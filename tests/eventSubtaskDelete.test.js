import test from 'node:test';
import assert from 'node:assert/strict';

import { deleteEventSubtask } from '../utils/doingDone.js';

test('deleteEventSubtask removes the indented event child line', () => {
  const date = '2025-12-15';
  const content = [
    date,
    '========================================',
    '[EVENTS]',
    '10:00 AM - Team Standup',
    '  - Draft agenda',
    '  x Already done',
    '',
    '[DOING]',
    '- Draft agenda',
    '',
    '[DONE]',
    ''
  ].join('\n');

  const out = deleteEventSubtask({
    content,
    dateStr: date,
    subtaskRawLine: '  - Draft agenda'
  });

  assert.doesNotMatch(out, /\n\s+- Draft agenda\n/);
});

test('deleteEventSubtask also removes matching DOING line when present', () => {
  const date = '2025-12-15';
  const content = [
    date,
    '========================================',
    '[EVENTS]',
    '10:00 AM - Team Standup',
    '  - Draft agenda',
    '',
    '[DOING]',
    '- Draft agenda',
    '- Something else',
    '',
    '[DONE]',
    ''
  ].join('\n');

  const out = deleteEventSubtask({
    content,
    dateStr: date,
    subtaskRawLine: '  - Draft agenda'
  });

  assert.doesNotMatch(out, /\[DOING\][\s\S]*- Draft agenda/);
  assert.match(out, /\[DOING\][\s\S]*- Something else/);
});



