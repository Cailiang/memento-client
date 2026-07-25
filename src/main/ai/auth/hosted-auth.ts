import { shell } from 'electron'
import { createHash, randomBytes } from 'node:crypto'
import type { HostedLoginState, HostedSessionState } from '../../../shared/ai-types'
import { LocalCredentialStore } from '../credentials/local-store'
import { AiError } from '../errors'
import { fetchWithTimeout } from '../providers/responses-stream'

const HOSTED_API_TIMEOUT_MS = 15_000
const HOSTED_ANALYSIS_TIMEOUT_MS = 310_000

interface TokenResponse {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

interface PendingLogin {
  verifier: string
  transactionId: string
}

function base64Url(value: Buffer): string {
  return value.toString('base64url')
}

export class HostedAuth {
  private pending: PendingLogin | null = null
  private refreshInFlight: Promise<string> | null = null

  constructor(
    private readonly gatewayUrl: string,
    private readonly credentials: LocalCredentialStore
  ) {}

  private requireGateway(): void {
    if (!this.gatewayUrl) {
      throw new AiError('AI_PROVIDER_NOT_CONFIGURED', '此构建未配置官方 Gateway 地址')
    }
  }

  private async saveTokens(tokens: TokenResponse): Promise<void> {
    await this.credentials.set('hosted-access-token', tokens.accessToken)
    await this.credentials.set('hosted-refresh-token', tokens.refreshToken)
    await this.credentials.set(
      'hosted-access-expires-at',
      String(Date.now() + tokens.expiresIn * 1000)
    )
  }

  private async exchange(code: string, verifier: string): Promise<void> {
    const response = await fetchWithTimeout(
      `${this.gatewayUrl}/v1/auth/pkce/exchange`,
      {
        method: 'POST',
        redirect: 'error',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ authorizationCode: code, codeVerifier: verifier })
      },
      15_000
    )
    if (!response.ok) {
      await response.body?.cancel()
      throw new AiError('AI_AUTH_REQUIRED', '官方服务登录交换失败', true)
    }
    await this.saveTokens((await response.json()) as TokenResponse)
  }

  async startLogin(): Promise<HostedLoginState> {
    this.requireGateway()
    const verifier = base64Url(randomBytes(48))
    const challenge = base64Url(createHash('sha256').update(verifier).digest())
    const response = await fetchWithTimeout(
      `${this.gatewayUrl}/v1/auth/pkce/start`,
      {
        method: 'POST',
        redirect: 'error',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          codeChallenge: challenge,
          codeChallengeMethod: 'S256',
          redirectUri: 'memento://auth/callback'
        })
      },
      15_000
    )
    if (!response.ok) {
      await response.body?.cancel()
      throw new AiError('AI_PROVIDER_UNAVAILABLE', '无法连接官方登录服务', true)
    }
    const payload = (await response.json()) as {
      transactionId?: string
      authorizationUrl?: string
      developmentCode?: string
    }
    if (!payload.transactionId) throw new AiError('AI_AUTH_REQUIRED', '登录事务无效')
    this.pending = { verifier, transactionId: payload.transactionId }
    if (payload.developmentCode) {
      await this.exchange(payload.developmentCode, verifier)
      this.pending = null
      return { status: 'authenticated', message: '已登录开发环境官方服务' }
    }
    if (!payload.authorizationUrl) throw new AiError('AI_AUTH_REQUIRED', '登录地址无效')
    await shell.openExternal(payload.authorizationUrl)
    return { status: 'browser-opened', message: '请在浏览器中完成登录' }
  }

  async completeLogin(callbackUrl: string): Promise<void> {
    if (!this.pending) return
    const url = new URL(callbackUrl)
    const code = url.searchParams.get('code')
    const transactionId = url.searchParams.get('transaction_id')
    if (!code || transactionId !== this.pending.transactionId) {
      throw new AiError('AI_AUTH_REQUIRED', '登录回调与当前事务不匹配')
    }
    await this.exchange(code, this.pending.verifier)
    this.pending = null
  }

  private async performRefresh(): Promise<string> {
    this.requireGateway()
    const refreshToken = await this.credentials.get('hosted-refresh-token')
    if (!refreshToken) throw new AiError('AI_AUTH_REQUIRED', '请先登录官方服务')
    const response = await fetchWithTimeout(
      `${this.gatewayUrl}/v1/auth/refresh`,
      {
        method: 'POST',
        redirect: 'error',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      },
      15_000
    )
    if (!response.ok) {
      await response.body?.cancel()
      await this.clearTokens()
      throw new AiError('AI_AUTH_EXPIRED', '登录已过期，请重新登录')
    }
    const tokens = (await response.json()) as TokenResponse
    await this.saveTokens(tokens)
    return tokens.accessToken
  }

  private refresh(): Promise<string> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.performRefresh().finally(() => {
        this.refreshInFlight = null
      })
    }
    return this.refreshInFlight
  }

  async accessToken(): Promise<string> {
    const [token, expiresAt] = await Promise.all([
      this.credentials.get('hosted-access-token'),
      this.credentials.get('hosted-access-expires-at')
    ])
    if (token && Number(expiresAt) > Date.now() + 30_000) return token
    return this.refresh()
  }

  async authorizedFetch(pathname: string, init: RequestInit = {}): Promise<Response> {
    this.requireGateway()
    const timeoutMs = pathname.startsWith('/v1/analysis/')
      ? HOSTED_ANALYSIS_TIMEOUT_MS
      : HOSTED_API_TIMEOUT_MS
    const request = async (token: string): Promise<Response> =>
      fetchWithTimeout(
        `${this.gatewayUrl}${pathname}`,
        {
          ...init,
          redirect: 'error',
          headers: { ...init.headers, authorization: `Bearer ${token}` }
        },
        timeoutMs,
        init.signal ?? undefined
      )
    let response = await request(await this.accessToken())
    if (response.status !== 401) return response
    await response.body?.cancel()
    response = await request(await this.refresh())
    return response
  }

  async session(): Promise<HostedSessionState> {
    if (!this.gatewayUrl) return { authenticated: false }
    if (!(await this.credentials.has('hosted-refresh-token'))) return { authenticated: false }
    try {
      const response = await this.authorizedFetch('/v1/session')
      if (!response.ok) return { authenticated: false }
      const value = (await response.json()) as HostedSessionState
      return { ...value, authenticated: true }
    } catch {
      return { authenticated: false }
    }
  }

  private async clearTokens(): Promise<void> {
    await this.credentials.delete('hosted-access-token')
    await this.credentials.delete('hosted-refresh-token')
    await this.credentials.delete('hosted-access-expires-at')
  }

  async logout(): Promise<void> {
    try {
      const token = await this.credentials.get('hosted-access-token')
      if (token) {
        const response = await fetchWithTimeout(
          `${this.gatewayUrl}/v1/auth/logout`,
          { method: 'POST', headers: { authorization: `Bearer ${token}` } },
          10_000
        )
        await response.body?.cancel()
      }
    } finally {
      await this.clearTokens()
    }
  }
}
