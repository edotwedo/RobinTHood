import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { resolveIosBuildNumber, stampIosBuildNumber } = require('./iosBuild.js');

// What `expo prebuild` emits from app.json's ios.buildNumber "6". TestFlight reads
// CFBundleVersion from this plist. A CURRENT_PROJECT_VERSION= on the xcodebuild command
// line does not change a literal string, so the upload stays build 6.
const GENERATED = [
  '<key>CFBundleShortVersionString</key>',
  '<string>1.0.0</string>',
  '<key>CFBundleVersion</key>',
  '<string>6</string>',
  'CURRENT_PROJECT_VERSION = 6;',
].join('\n');

test('the generated project is build 6 until CI stamps it', () => {
  assert.match(GENERATED, /<key>CFBundleVersion<\/key>\s*<string>6<\/string>/);
  assert.match(GENERATED, /CURRENT_PROJECT_VERSION = 6;/);
  assert.equal(resolveIosBuildNumber('6', ''), '6');
});

test('a CI run number replaces the literal 6 in the plist and the project', () => {
  assert.equal(resolveIosBuildNumber('6', '19'), '19');
  const stamped = stampIosBuildNumber(GENERATED, '19');
  assert.match(stamped, /<key>CFBundleVersion<\/key>\s*<string>19<\/string>/);
  assert.match(stamped, /CURRENT_PROJECT_VERSION = 19;/);
  assert.doesNotMatch(stamped, /<string>6<\/string>/);
  assert.doesNotMatch(stamped, /CURRENT_PROJECT_VERSION = 6;/);
  assert.match(stamped, /<string>1\.0\.0<\/string>/);
});

test('a blank CI value leaves the app.json number, and a bad value is refused', () => {
  assert.equal(resolveIosBuildNumber('6', '   '), '6');
  assert.throws(() => stampIosBuildNumber(GENERATED, '0'), /positive integer/);
  assert.throws(() => stampIosBuildNumber(GENERATED, '19a'), /positive integer/);
});
