import test from 'node:test';
import assert from 'node:assert/strict';

import { getProjectNoteDatesChronological, insertProjectNoteDate } from '../utils/projectNotes.ts';

test('insertProjectNoteDate inserts new date block at cursor with clean spacing', () => {
  const original = 'Some intro\n';
  const res = insertProjectNoteDate({ notes: original, dateStr: '2025-12-19', cursor: original.length });
  assert.equal(res.inserted, true);
  assert.match(res.notes, /Some intro\n\n2025-12-19\n========================================\n\n/);
});

test('insertProjectNoteDate does not duplicate an existing date; returns cursor at existing', () => {
  const original = '2025-12-18\n========================================\n\nDid stuff\n';
  const res = insertProjectNoteDate({ notes: original, dateStr: '2025-12-18', cursor: 0 });
  assert.equal(res.inserted, false);
  assert.equal(res.notes, original);
  assert.equal(res.cursor, 0);
});

test('getProjectNoteDatesChronological returns oldest-first', () => {
  const notes = [
    '2025-12-19',
    '========================================',
    '',
    'x',
    '',
    '2025-12-18',
    '========================================',
    '',
    'y',
  ].join('\n');
  const dates = getProjectNoteDatesChronological(notes);
  assert.deepEqual(dates, ['2025-12-18', '2025-12-19']);
});

