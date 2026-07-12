import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { copySpawnHelper, ensureDarwinNodePtyBuild } from './stage-native-deps.mjs'

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

test('ensureDarwinNodePtyBuild rebuilds missing Darwin native payloads', () => {
  const srcRoot = mkdtempSync(path.join(os.tmpdir(), 'hermes-node-pty-source-'))
  const calls = []

  const rebuilt = ensureDarwinNodePtyBuild({
    platform: 'darwin',
    arch: 'arm64',
    srcRoot,
    rebuildCommand: '/fake/electron-rebuild',
    run(command, args, options) {
      calls.push({ command, args, options })
      const release = path.join(srcRoot, 'build', 'Release')
      mkdirSync(release, { recursive: true })
      writeFileSync(path.join(release, 'pty.node'), 'native-addon')
      writeFileSync(path.join(release, 'spawn-helper'), 'native-helper')
      chmodSync(path.join(release, 'spawn-helper'), 0o755)
    }
  })

  assert.equal(rebuilt, true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].command, '/fake/electron-rebuild')
  assert.deepEqual(calls[0].args, ['-f', '-w', 'node-pty', '--arch', 'arm64'])
})

test('ensureDarwinNodePtyBuild skips non-Darwin targets but rebuilds existing Darwin payloads', () => {
  const srcRoot = mkdtempSync(path.join(os.tmpdir(), 'hermes-node-pty-source-'))
  const release = path.join(srcRoot, 'build', 'Release')
  mkdirSync(release, { recursive: true })
  writeFileSync(path.join(release, 'pty.node'), 'native-addon')
  writeFileSync(path.join(release, 'spawn-helper'), 'native-helper')
  chmodSync(path.join(release, 'spawn-helper'), 0o755)
  const unexpectedRun = () => assert.fail('rebuild runner must not be called')

  assert.equal(ensureDarwinNodePtyBuild({ platform: 'linux', arch: 'arm64', srcRoot, run: unexpectedRun }), false)

  let rebuilds = 0
  assert.equal(
    ensureDarwinNodePtyBuild({
      platform: 'darwin',
      arch: 'arm64',
      srcRoot,
      rebuildCommand: '/fake/electron-rebuild',
      run() {
        rebuilds += 1
      }
    }),
    true
  )
  assert.equal(rebuilds, 1)
})
