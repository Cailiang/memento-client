import type { AppLanguage } from '../../../shared/app-settings'
import type { AgentRunStatus } from '../../../shared/agent-types'

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent
  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`
}

export function formatStorageBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1000)), units.length - 1)
  const value = bytes / 1000 ** exponent
  return `${value.toFixed(exponent === 0 ? 0 : 2)} ${units[exponent]}`
}

export function relativeDate(value: string | null, language: AppLanguage): string {
  if (!value) return language === 'zh-CN' ? '无使用记录' : 'No usage record'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return language === 'zh-CN' ? '无使用记录' : 'No usage record'
  const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000))
  if (language === 'zh-CN') {
    if (days === 0) return '今天'
    if (days === 1) return '昨天'
    if (days < 7) return `${days} 天前`
    if (days < 30) return `${Math.floor(days / 7)} 周前`
    if (days < 365) return `${Math.floor(days / 30)} 个月前`
    return `${Math.floor(days / 365)} 年前`
  }
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 30) return `${Math.floor(days / 7)} ${Math.floor(days / 7) === 1 ? 'week' : 'weeks'} ago`
  if (days < 365) return `${Math.floor(days / 30)} ${Math.floor(days / 30) === 1 ? 'month' : 'months'} ago`
  const years = Math.floor(days / 365)
  return `${years} ${years === 1 ? 'year' : 'years'} ago`
}

export function formatDateTime(value: string, language: AppLanguage): string {
  return new Intl.DateTimeFormat(language, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}

export function runStatusLabel(status: AgentRunStatus, language: AppLanguage): string {
  const labels: Record<AgentRunStatus, [string, string]> = {
    preparing: ['准备中', 'Preparing'],
    analyzing: ['分析中', 'Analyzing'],
    'plan-ready': ['计划已准备', 'Plan ready'],
    'awaiting-confirmation': ['等待确认', 'Awaiting confirmation'],
    executing: ['执行中', 'Executing'],
    verifying: ['验证中', 'Verifying'],
    completed: ['已完成', 'Completed'],
    cancelled: ['已取消', 'Cancelled'],
    failed: ['失败', 'Failed']
  }
  return labels[status][language === 'zh-CN' ? 0 : 1]
}
