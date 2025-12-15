import test from 'node:test';
import assert from 'node:assert/strict';

import { moveDoingItemToDone, getDoingItemsForDate } from '../utils/doingDone.js';

test('getDoingItemsForDate returns doing lines', () => {
  const date = '2025-12-15';
  const content = [
    date,
    '========================================',
    '[EVENTS]',
    '10:00 AM - Team Standup',
    '',
    '[DOING]',
    '- Draft agenda #Team_Standup',
    '- Another thing',
    '',
    '[DONE]',
    'x Old thing',
    ''
  ].join('\n');

  const items = getDoingItemsForDate(content, date);
  assert.equal(items.length, 2);
  assert.equal(items[0].trim(), '- Draft agenda #Team_Standup');
});

test('moveDoingItemToDone removes from DOING and inserts into DONE', () => {
  const date = '2025-12-15';
  const content = [
    date,
    '========================================',
    '[EVENTS]',
    '10:00 AM - Team Standup',
    '  - Draft agenda',
    '',
    '[DOING]',
    '- Draft agenda #Team_Standup',
    '- Another thing',
    '',
    '[DONE]',
    'x Old thing',
    ''
  ].join('\n');

  const out = moveDoingItemToDone({
    content,
    dateStr: date,
    doingRawLine: '- Draft agenda #Team_Standup'
  });

  assert.doesNotMatch(out, /\[DOING\][\s\S]*- Draft agenda #Team_Standup/);
  assert.match(out, /\[DONE\]\nx Draft agenda #Team_Standup/);
  assert.match(out, /\[EVENTS\][\s\S]*10:00 AM - Team Standup\n  x Draft agenda/);
});

test('moveDoingItemToDone works when the selected line had a trailing /done command', () => {
  const date = '2025-12-15';
  const content = [
    date,
    '========================================',
    '[DOING]',
    '- Draft agenda #Team_Standup',
    '- Another thing',
    '',
    '[DONE]',
    'x Old thing',
    ''
  ].join('\n');

  // Simulate selecting a line that includes the inline command token
  const selectedFromMenu = '- Draft agenda #Team_Standup /done';
  const cleanedSelected = selectedFromMenu.replace(/\s\/done\s*$/i, '');

  const out = moveDoingItemToDone({
    content,
    dateStr: date,
    doingRawLine: cleanedSelected
  });

  assert.match(out, /\[DONE\]\nx Draft agenda #Team_Standup/);
});

test('moveDoingItemToDone creates DONE if missing', () => {
  const date = '2025-12-15';
  const content = [
    date,
    '========================================',
    '[DOING]',
    '- One',
    ''
  ].join('\n');

  const out = moveDoingItemToDone({
    content,
    dateStr: date,
    doingRawLine: '- One'
  });

  assert.match(out, /\[DONE\]\nx One/);
});


