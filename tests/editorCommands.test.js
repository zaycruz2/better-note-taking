import test from 'node:test';
import assert from 'node:assert/strict';

import { detectCommandAtCursor, stripRange } from '../utils/editorCommands.ts';

test('detectCommandAtCursor detects /subtask with trailing space', () => {
  const text = 'hello /subtask ';
  const cursor = text.length;
  const detected = detectCommandAtCursor(text, cursor);
  assert.ok(detected);
  assert.equal(detected.mode, 'subtask');
  assert.equal(detected.value, '/subtask');
  assert.equal(detected.start, 'hello '.length);
  assert.equal(detected.end, cursor);
});

test('detectCommandAtCursor detects /subtask at start of file', () => {
  const text = '/subtask';
  const detected = detectCommandAtCursor(text, text.length);
  assert.ok(detected);
  assert.equal(detected.mode, 'subtask');
  assert.equal(detected.start, 0);
});

test('detectCommandAtCursor detects /event and /done with trailing whitespace', () => {
  const eventText = 'x /event   ';
  const eventDetected = detectCommandAtCursor(eventText, eventText.length);
  assert.ok(eventDetected);
  assert.equal(eventDetected.mode, 'event');
  assert.equal(eventDetected.value, '/event');

  const doneText = 'do thing /done   ';
  const doneDetected = detectCommandAtCursor(doneText, doneText.length);
  assert.ok(doneDetected);
  assert.equal(doneDetected.mode, 'done');
  assert.equal(doneDetected.value, '/done');
});

test('detectCommandAtCursor detects /project and /proj with optional query', () => {
  const t1 = 'note /project ';
  const d1 = detectCommandAtCursor(t1, t1.length);
  assert.ok(d1);
  assert.equal(d1.mode, 'project');
  assert.equal(d1.value, '/project');

  const t2 = 'note /proj Assistant';
  const d2 = detectCommandAtCursor(t2, t2.length);
  assert.ok(d2);
  assert.equal(d2.mode, 'project');
  assert.equal(d2.value, '/proj');
});

test('detectCommandAtCursor does not match similar prefixes', () => {
  const text = 'hello /subtasks ';
  const detected = detectCommandAtCursor(text, text.length);
  assert.equal(detected, null);
});

test('stripRange removes command and leaves cursor at start', () => {
  const text = 'hello /subtask ';
  const detected = detectCommandAtCursor(text, text.length);
  assert.ok(detected);

  const stripped = stripRange(text, detected.start, detected.end);
  assert.equal(stripped.text, 'hello ');
  assert.equal(stripped.cursor, 'hello '.length);
});

