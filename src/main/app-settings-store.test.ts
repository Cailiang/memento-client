import { mkdtemp, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { AppSettingsStore } from './app-settings-store'

describe('AppSettingsStore', () => {
  it('persists validated application settings', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'memento-settings-'))
    const store = new AppSettingsStore(directory)
    const value = await store.update({
      language: 'en-US',
      theme: 'graphite',
      launchAtLogin: true,
      closeToTray: true
    })

    expect(value).toEqual({
      language: 'en-US',
      theme: 'graphite',
      launchAtLogin: true,
      closeToTray: true
    })
    await expect(readFile(path.join(directory, 'app-settings.json'), 'utf8')).resolves.toContain(
      '"graphite"'
    )
  })

  it('falls back when stored settings contain unsupported values', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'memento-settings-'))
    const store = new AppSettingsStore(directory)
    const value = await store.update({ language: 'invalid' as never, theme: 'neon' as never })

    expect(value.language).toBe('zh-CN')
    expect(value.theme).toBe('porcelain')
  })
})
