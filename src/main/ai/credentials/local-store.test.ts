import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { LocalCredentialStore } from './local-store'

describe('LocalCredentialStore', () => {
  it('persists credentials as local application data', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'memento-credentials-'))
    const store = new LocalCredentialStore(directory)

    await store.set('byok-api-key', 'test-api-key')

    await expect(store.get('byok-api-key')).resolves.toBe('test-api-key')
    await expect(readFile(path.join(directory, 'ai-credentials.json'), 'utf8')).resolves.toBe(
      JSON.stringify(
        { schemaVersion: 1, values: { 'byok-api-key': 'test-api-key' } },
        null,
        2
      )
    )
  })

  it('ignores the legacy encrypted credential format without accessing the keychain', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'memento-credentials-'))
    await writeFile(
      path.join(directory, 'ai-credentials.json'),
      JSON.stringify({ 'hosted-refresh-token': 'legacy-safe-storage-ciphertext' })
    )
    const store = new LocalCredentialStore(directory)

    await expect(store.get('hosted-refresh-token')).resolves.toBeNull()
    await expect(store.has('hosted-refresh-token')).resolves.toBe(false)
  })

  it('removes individual values and clears the credential file', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'memento-credentials-'))
    const filePath = path.join(directory, 'ai-credentials.json')
    const store = new LocalCredentialStore(directory)
    await store.set('first', 'one')
    await store.set('second', 'two')

    await store.delete('first')
    await expect(store.get('first')).resolves.toBeNull()
    await expect(store.get('second')).resolves.toBe('two')

    await store.clear()
    await expect(readFile(filePath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
