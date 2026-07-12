import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { copySpawnHelper } from './stage-native-deps.mjs'

test('copySpawnHelper makes a packaged Unix helper executable', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'hermes-stage-native-'))
  const source = path.join(root, 'source-helper')
  const destination = path.join(root, 'destination-helper')

  writeFileSync(source, 'native-helper')
  chmodSync(source, 0o644)

  copySpawnHelper(source, destination)

  assert.equal(readFileSync(destination, 'utf8'), 'native-helper')
  assert.equal(statSync(destination).mode & 0o777, 0o755)
})
