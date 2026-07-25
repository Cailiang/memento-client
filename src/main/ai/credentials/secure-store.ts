import { safeStorage } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'

type StoredCredentials = Record<string, string>

export class SecureCredentialStore {
  private readonly sessionValues = new Map<string, string>()
  private readonly filePath: string

  constructor(userDataPath: string) {
    this.filePath = path.join(userDataPath, 'ai-credentials.json')
  }

  private async readFile(): Promise<StoredCredentials> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8')
      const parsed = JSON.parse(raw) as unknown
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as StoredCredentials)
        : {}
    } catch {
      return {}
    }
  }

  private async writeFile(value: StoredCredentials): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true })
    const temporaryPath = `${this.filePath}.tmp`
    await fs.writeFile(temporaryPath, JSON.stringify(value), { mode: 0o600 })
    await fs.rename(temporaryPath, this.filePath)
  }

  async set(key: string, value: string): Promise<'persistent' | 'session'> {
    if (!safeStorage.isEncryptionAvailable()) {
      this.sessionValues.set(key, value)
      return 'session'
    }
    const credentials = await this.readFile()
    credentials[key] = safeStorage.encryptString(value).toString('base64')
    await this.writeFile(credentials)
    this.sessionValues.delete(key)
    return 'persistent'
  }

  async get(key: string): Promise<string | null> {
    const sessionValue = this.sessionValues.get(key)
    if (sessionValue !== undefined) return sessionValue
    if (!safeStorage.isEncryptionAvailable()) return null
    const credentials = await this.readFile()
    const encrypted = credentials[key]
    if (!encrypted) return null
    try {
      return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
    } catch {
      return null
    }
  }

  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== null
  }

  async delete(key: string): Promise<void> {
    this.sessionValues.delete(key)
    const credentials = await this.readFile()
    if (!(key in credentials)) return
    delete credentials[key]
    await this.writeFile(credentials)
  }

  async clear(): Promise<void> {
    this.sessionValues.clear()
    try {
      await fs.unlink(this.filePath)
    } catch {
      // The store is already empty.
    }
  }
}
