'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
process.env.RAFASHACODEID_BANNER = '0';
const evaluateCalc = require('../lib/safe-calculator');
const getCommandPrefix = require('../lib/command-prefix');
const handleMessage = require('../case');

test('calculator respects operator precedence and parentheses', () => {
  assert.equal(evaluateCalc('1 + 2 * (3 + 4)'), 15);
  assert.equal(evaluateCalc('-2.5 * 4 + 3'), -7);
  assert.equal(evaluateCalc('10 / 4'), 2.5);
});

test('calculator rejects invalid, unsafe, and non-finite expressions', () => {
  for (const expression of ['', '1 / 0', '1 + process.exit()', '2 ** 8', '1 + )']) {
    assert.throws(() => evaluateCalc(expression));
  }
});

test('calculator bounds long and deeply nested expressions', () => {
  assert.throws(() => evaluateCalc('1'.repeat(121)));
  assert.throws(() => evaluateCalc(`${'('.repeat(33)}1${')'.repeat(33)}`));
});

test('command prefix uses only configured prefixes and longest match', () => {
  assert.equal(getCommandPrefix('!!ping', ['!', '!!'], '.'), '!!');
  assert.equal(getCommandPrefix('@ping', ['', '!', '.'], '.'), '');
  assert.equal(getCommandPrefix('.ping', ['', '!', '.'], '.'), '.');
  assert.equal(getCommandPrefix('!ping', null, '!'), '!');
});

test('message handler initializes Baileys helpers for a regular message', async () => {
  await handleMessage(
    { user: { id: '9999999999@s.whatsapp.net' } },
    {
      key: { remoteJid: '6281234567890@s.whatsapp.net', id: 'smoke-test', fromMe: false },
      message: { conversation: 'hello' },
      pushName: 'Test'
    },
    [],
    null
  );
});
