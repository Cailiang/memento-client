import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildPrivilegedMoves, privilegedMoveArguments } from './privileged-cleanup'

describe('privileged cleanup staging', () => {
  it('keeps every destination inside the application staging directory', () => {
    const stagingDirectory = '/Users/test/Library/Application Support/memento/Privileged Cleanup/pending-1'
    const moves = buildPrivilegedMoves(stagingDirectory, [
      '/Library/LaunchAgents/com.example.worker.plist',
      '/Applications/Example.app'
    ])

    expect(moves).toEqual([
      {
        source: '/Library/LaunchAgents/com.example.worker.plist',
        destination: path.join(stagingDirectory, '001-com.example.worker.plist')
      },
      {
        source: '/Applications/Example.app',
        destination: path.join(stagingDirectory, '002-Example.app')
      }
    ])
    expect(moves.every(({ destination }) => path.dirname(destination) === stagingDirectory)).toBe(true)
  })

  it('encodes service targets before source and staging destination pairs', () => {
    const moves = buildPrivilegedMoves('/tmp/memento-stage', [
      '/Library/LaunchAgents/com.example.worker.plist'
    ])

    expect(privilegedMoveArguments(501, ['/Library/LaunchAgents/com.example.worker.plist'], moves))
      .toEqual([
        'gui/501',
        '1',
        '/Library/LaunchAgents/com.example.worker.plist',
        '/Library/LaunchAgents/com.example.worker.plist',
        '/tmp/memento-stage/001-com.example.worker.plist'
      ])
  })

  it('uses command paths that exist on macOS', async () => {
    const mainSource = await readFile(new URL('./index.ts', import.meta.url), 'utf8')

    expect(mainSource).toContain('/bin/test -e')
    expect(mainSource).not.toContain('/usr/bin/test')
  })
})
