import test from 'node:test';
import assert from 'node:assert/strict';

import { deleteEvent } from '../utils/doingDone.js';

test('deleteEvent removes an event line from the EVENTS section', () => {
  const date = '2025-12-15';
  const content = [
    date,
    '========================================',
    '[EVENTS]',
    '10:00 AM - Team Standup',
    '02:00 PM - Deep Work Session',
    '',
    '[DOING]',
    '',
    '[DONE]',
    ''
  ].join('\n');

  const out = deleteEvent({
    content,
    dateStr: date,
    eventRawLine: '10:00 AM - Team Standup'
  });

  assert.doesNotMatch(out, /Team Standup/);
  assert.match(out, /Deep Work Session/);
});

test('deleteEvent removes event and all its child subtasks', () => {
  const date = '2025-12-15';
  const content = [
    date,
    '========================================',
    '[EVENTS]',
    '10:00 AM - Team Standup',
    '  - Draft agenda',
    '  - Review notes',
    '02:00 PM - Deep Work Session',
    '',
    '[DOING]',
    '',
    '[DONE]',
    ''
  ].join('\n');

  const out = deleteEvent({
    content,
    dateStr: date,
    eventRawLine: '10:00 AM - Team Standup'
  });

  assert.doesNotMatch(out, /Team Standup/);
  assert.doesNotMatch(out, /Draft agenda/);
  assert.doesNotMatch(out, /Review notes/);
  assert.match(out, /Deep Work Session/);
});

test('deleteEvent does nothing if event not found', () => {
  const date = '2025-12-15';
  const content = [
    date,
    '========================================',
    '[EVENTS]',
    '10:00 AM - Team Standup',
    '',
    '[DOING]',
    ''
  ].join('\n');

  const out = deleteEvent({
    content,
    dateStr: date,
    eventRawLine: 'Nonexistent Event'
  });

  assert.strictEqual(out, content);
});

test('deleteEvent works with different date blocks', () => {
  const content = [
    '2025-12-14',
    '========================================',
    '[EVENTS]',
    '09:00 AM - Yesterday Meeting',
    '',
    '2025-12-15',
    '========================================',
    '[EVENTS]',
    '10:00 AM - Today Standup',
    '02:00 PM - Today Session',
    '',
    '[DOING]',
    ''
  ].join('\n');

  const out = deleteEvent({
    content,
    dateStr: '2025-12-15',
    eventRawLine: '10:00 AM - Today Standup'
  });

  assert.match(out, /Yesterday Meeting/);
  assert.doesNotMatch(out, /Today Standup/);
  assert.match(out, /Today Session/);
});

