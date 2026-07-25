import { promises as fs } from 'node:fs'
import path from 'node:path'

interface StoredCredentials {
  schemaVersion: 1
  values: Record<string, string>
}

const emptyCredentials = (): StoredCredentials => ({ schemaVersion: 1, values: {} })

export class LocalCredentialStore {
  private readonly filePath: string

  constructor(userDataPath: string) {
    this.filePath = path.join(userDataPath, 'ai-credentials.json')
  }

  private async readFile(): Promise<StoredCredentials> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.filePath, 'utf8')) as unknown
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return emptyCredentials()

      const candidate = parsed as Partial<StoredCredentials>
      if (
        candidate.schemaVersion !== 1 ||
        !candidate.values ||
        typeof candidate.values !== 'object' ||
        Array.isArray(candidate.values)
      ) {
        return emptyCredentials()
      }

      const values = Object.fromEntries(
        Object.entries(candidate.values).filter((entry): entry is [string, string] => {
          return typeof entry[1] === 'string'
        })
      )
      return { schemaVersion: 1, values }
    } catch {
      return emptyCredentials()
    }
  }

  private async writeFile(value: StoredCredentials): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true })
    const temporaryPath = `${this.filePath}.tmp`
    await fs.writeFile(temporaryPath, JSON.stringify(value, null, 2), { mode: 0o600 })
    await fs.rename(temporaryPath, this.filePath)
  }

  async set(key: string, value: string): Promise<void> {
    const credentials = await this.readFile()
    credentials.values[key] = value
    await this.writeFile(credentials)
  }

  async get(key: string): Promise<string | null> {
    const credentials = await this.readFile()
    return credentials.values[key] ?? null
  }

  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== null
  }

  async delete(key: string): Promise<void> {
    const credentials = await this.readFile()
    if (!(key in credentials.values)) return
    delete credentials.values[key]
    await this.writeFile(credentials)
  }

  async clear(): Promise<void> {
    try {
      await fs.unlink(this.filePath)
    } catch {
      // The store is already empty.
    }
  }
}
