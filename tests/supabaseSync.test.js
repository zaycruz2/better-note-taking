import test from 'node:test';
import assert from 'node:assert/strict';

// We test the resolveInitialContent logic which is the same as before
// but now lives in supabaseClient.ts. Since that's TypeScript and uses
// import.meta.env, we recreate the pure logic here for testing.

function resolveInitialContent({
  localContent,
  localUpdatedAt,
  remoteContent,
  remoteUpdatedAt,
}) {
  const hasRemote = typeof remoteContent === 'string' && remoteContent.length > 0;
  const hasLocal = typeof localContent === 'string' && localContent.length > 0;

  if (!hasRemote && !hasLocal) {
    return { source: 'none', content: '', updatedAt: 0 };
  }
  if (hasRemote && !hasLocal) {
    return { source: 'remote', content: remoteContent, updatedAt: remoteUpdatedAt || 0 };
  }
  if (!hasRemote && hasLocal) {
    return { source: 'local', content: localContent, updatedAt: localUpdatedAt || 0 };
  }

  // Both exist: choose the newer one.
  if (remoteUpdatedAt > localUpdatedAt) {
    return { source: 'remote', content: remoteContent, updatedAt: remoteUpdatedAt };
  }
  return { source: 'local', content: localContent, updatedAt: localUpdatedAt };
}

test('resolveInitialContent returns none when both are empty', () => {
  const result = resolveInitialContent({
    localContent: '',
    localUpdatedAt: 0,
    remoteContent: '',
    remoteUpdatedAt: 0,
  });
  assert.equal(result.source, 'none');
  assert.equal(result.content, '');
});

test('resolveInitialContent prefers remote when local is empty', () => {
  const result = resolveInitialContent({
    localContent: '',
    localUpdatedAt: 0,
    remoteContent: 'remote notes',
    remoteUpdatedAt: 100,
  });
  assert.equal(result.source, 'remote');
  assert.equal(result.content, 'remote notes');
  assert.equal(result.updatedAt, 100);
});

test('resolveInitialContent prefers local when remote is empty', () => {
  const result = resolveInitialContent({
    localContent: 'local notes',
    localUpdatedAt: 200,
    remoteContent: '',
    remoteUpdatedAt: 0,
  });
  assert.equal(result.source, 'local');
  assert.equal(result.content, 'local notes');
  assert.equal(result.updatedAt, 200);
});

test('resolveInitialContent prefers newer remote over older local', () => {
  const result = resolveInitialContent({
    localContent: 'local notes',
    localUpdatedAt: 100,
    remoteContent: 'remote notes',
    remoteUpdatedAt: 200,
  });
  assert.equal(result.source, 'remote');
  assert.equal(result.content, 'remote notes');
  assert.equal(result.updatedAt, 200);
});

test('resolveInitialContent prefers newer local over older remote', () => {
  const result = resolveInitialContent({
    localContent: 'local notes',
    localUpdatedAt: 300,
    remoteContent: 'remote notes',
    remoteUpdatedAt: 200,
  });
  assert.equal(result.source, 'local');
  assert.equal(result.content, 'local notes');
  assert.equal(result.updatedAt, 300);
});

test('resolveInitialContent prefers local when timestamps are equal', () => {
  const result = resolveInitialContent({
    localContent: 'local notes',
    localUpdatedAt: 100,
    remoteContent: 'remote notes',
    remoteUpdatedAt: 100,
  });
  // When equal, local wins (remoteUpdatedAt > localUpdatedAt is false)
  assert.equal(result.source, 'local');
  assert.equal(result.content, 'local notes');
});

// Test anonymous user detection logic
test('isAnonymousUser correctly identifies anonymous users', () => {
  // Simulating the logic from supabaseClient.ts
  function isAnonymousUser(user) {
    if (!user) return false;
    return user.is_anonymous === true;
  }

  assert.equal(isAnonymousUser(null), false);
  assert.equal(isAnonymousUser({ id: '123' }), false);
  assert.equal(isAnonymousUser({ id: '123', is_anonymous: false }), false);
  assert.equal(isAnonymousUser({ id: '123', is_anonymous: true }), true);
});


