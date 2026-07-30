import {
  AppWindow,
  EyeOff,
  ExternalLink,
  LockKeyhole,
  LoaderCircle,
  Search,
  Sparkles,
  Trash2
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { InstalledApplication } from '../../../shared/types'
import { useI18n } from '../i18n'
import { formatBytes, relativeDate } from './utils'

export type ApplicationFilter = 'all' | 'recent' | 'unused' | 'system'
export type ApplicationSort = 'recent' | 'size' | 'name'

export function filterAndSortApplications(
  applications: readonly InstalledApplication[],
  search: string,
  filter: ApplicationFilter,
  sort: ApplicationSort,
  language = 'zh-CN'
): InstalledApplication[] {
  const query = search.trim().toLocaleLowerCase()
  return applications
    .filter((application) => !query || [
      application.name,
      application.bundleId ?? '',
      application.location
    ].join(' ').toLocaleLowerCase().includes(query))
    .filter((application) => (
      filter === 'all' ||
      (filter === 'unused' && application.unused) ||
      (filter === 'recent' && !application.unused) ||
      (filter === 'system' && application.scope === 'system')
    ))
    .sort((left, right) => {
      if (sort === 'size') return right.sizeBytes - left.sizeBytes
      if (sort === 'name') return left.name.localeCompare(right.name, language)
      const leftTime = left.lastUsedAt ? new Date(left.lastUsedAt).getTime() : 0
      const rightTime = right.lastUsedAt ? new Date(right.lastUsedAt).getTime() : 0
      return rightTime - leftTime
    })
}

export function ApplicationIcon({ application }: { application: Pick<InstalledApplication, 'id' | 'name'> }): React.JSX.Element {
  const [source, setSource] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setVisible(true)
    }, { rootMargin: '100px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let active = true
    if (!visible || !window.memento) return
    void window.memento.getApplicationIcon(application.id).then((value) => {
      if (active) setSource(value)
    })
    return () => { active = false }
  }, [application.id, visible])

  return (
    <div className="app-logo" ref={ref}>
      {source ? <img src={source} alt="" /> : <AppWindow size={28} />}
    </div>
  )
}

export function ApplicationsPage({
  applications,
  openingId,
  removingId,
  ignoredCount,
  onOpen,
  onUninstall,
  onIgnore,
  onManageIgnored,
  onAgentPrompt
}: {
  applications: InstalledApplication[]
  openingId: string | null
  removingId: string | null
  ignoredCount: number
  onOpen: (application: InstalledApplication) => void
  onUninstall: (application: InstalledApplication) => void
  onIgnore: (application: InstalledApplication) => void
  onManageIgnored: () => void
  onAgentPrompt: (prompt: string) => void
}): React.JSX.Element {
  const { language, text } = useI18n()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<ApplicationFilter>('all')
  const [sort, setSort] = useState<ApplicationSort>('recent')
  const manageable = applications.filter((application) => application.action && !application.protectedReason && application.scope !== 'system')
  const totalBytes = applications.reduce((sum, application) => sum + application.sizeBytes, 0)
  const filtered = useMemo(
    () => filterAndSortApplications(applications, search, filter, sort, language),
    [applications, filter, language, search, sort]
  )

  return (
    <section className="page content-page is-active">
      <div className="page-command-bar">
        <span className="page-command-summary">{text(`共 ${applications.length} 个应用，其中 ${manageable.length} 个可卸载，占用 ${formatBytes(totalBytes)}`, `${applications.length} applications, ${manageable.length} uninstallable, using ${formatBytes(totalBytes)}`)}</span>
        <div className="page-command-actions">
          <button type="button" className="secondary-button" onClick={onManageIgnored}>
            <EyeOff size={16} />{text(`已忽略 ${ignoredCount} 项`, `${ignoredCount} ignored`)}
          </button>
          <button type="button" className="secondary-button" onClick={() => onAgentPrompt(text('帮我检查长期没用的应用和可以安全清理的应用残留', 'Find unused applications and safe application leftovers'))}>
            <Sparkles size={16} />{text('Agent 分析', 'Agent analysis')}
          </button>
        </div>
      </div>

      <div className="toolbar">
        <label className="search-field">
          <Search size={16} />
          <input type="search" placeholder={text('搜索应用名称', 'Search applications')} aria-label={text('搜索应用名称', 'Search applications')} value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        <select aria-label={text('筛选应用', 'Filter applications')} value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
          <option value="all">{text('全部应用', 'All applications')}</option>
          <option value="recent">{text('最近使用', 'Recently used')}</option>
          <option value="unused">{text('3 个月未使用', 'Unused for 3 months')}</option>
          <option value="system">{text('系统应用', 'System applications')}</option>
        </select>
        <select aria-label={text('应用排序', 'Sort applications')} value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
          <option value="recent">{text('最近使用优先', 'Recently used first')}</option>
          <option value="size">{text('占用空间优先', 'Largest first')}</option>
          <option value="name">{text('名称排序', 'Name')}</option>
        </select>
      </div>

      {filtered.length ? (
        <div className="app-grid">
          {filtered.map((application) => (
            <article className={`app-card ${removingId === application.id ? 'is-removing' : ''}`} key={application.id} aria-busy={removingId === application.id}>
              {(application.scope === 'system' || application.backgroundOnly) && <span className="app-scope-label">{application.scope === 'system' ? text('系统', 'System') : text('后台组件', 'Helper')}</span>}
              <button type="button" className="icon-button app-ignore-button" onClick={() => onIgnore(application)} disabled={removingId === application.id} title={text('忽略应用', 'Ignore application')} aria-label={text(`忽略 ${application.name}`, `Ignore ${application.name}`)}>
                <EyeOff size={14} />
              </button>
              <ApplicationIcon application={application} />
              <div className="app-title"><strong title={application.name}>{application.name}</strong><small>{text(`版本 ${application.version || '未知'}`, `Version ${application.version || 'unknown'}`)}</small></div>
              <div className="app-meta">
                <div><span>{text('最后使用', 'Last used')}</span><strong>{relativeDate(application.lastUsedAt, language)}</strong></div>
                <div><span>{text('大小', 'Size')}</span><strong>{formatBytes(application.sizeBytes)}</strong></div>
              </div>
              <div className="app-actions">
                <button type="button" className="secondary-button app-agent-action" onClick={() => onAgentPrompt(text(
                  `请分析应用“${application.name}”。Bundle ID：${application.bundleId ?? '未知'}；版本：${application.version}；路径：${application.location}；最后使用：${relativeDate(application.lastUsedAt, language)}；类型：${application.scope === 'system' ? 'macOS 系统应用' : application.backgroundOnly ? '后台辅助组件' : '用户安装应用'}；可执行文件：${application.executable ?? '未知'}；注册的 URL 协议：${application.urlSchemes?.join(', ') || '无'}。请说明它是什么、主要用途、是否属于驱动/安全组件/辅助程序、能否卸载、卸载影响和你的建议。`,
                  `Analyze the application "${application.name}". Bundle ID: ${application.bundleId ?? 'unknown'}; version: ${application.version}; path: ${application.location}; last used: ${relativeDate(application.lastUsedAt, language)}; type: ${application.scope === 'system' ? 'macOS system application' : application.backgroundOnly ? 'background helper' : 'user-installed application'}; executable: ${application.executable ?? 'unknown'}; registered URL schemes: ${application.urlSchemes?.join(', ') || 'none'}. Explain what it is, its purpose, whether it is a driver, security component, or helper, whether it can be uninstalled, the impact, and your recommendation.`
                ))} disabled={removingId === application.id}>
                  <Sparkles size={14} />{text('问 Agent', 'Ask Agent')}
                </button>
                <button type="button" className="icon-button" onClick={() => onOpen(application)} disabled={openingId === application.id || removingId === application.id} title={text(`打开 ${application.name}`, `Open ${application.name}`)} aria-label={text(`打开 ${application.name}`, `Open ${application.name}`)}>
                  {openingId === application.id ? <LoaderCircle className="spinner" size={14} /> : <ExternalLink size={14} />}
                </button>
                {application.action ? (
                  <button type="button" className="icon-button uninstall-app" onClick={() => onUninstall(application)} disabled={removingId === application.id} title={text(`卸载 ${application.name}`, `Uninstall ${application.name}`)} aria-label={text(`卸载 ${application.name}`, `Uninstall ${application.name}`)}>
                    <Trash2 size={14} />
                  </button>
                ) : (
                  <button type="button" className="icon-button is-protected" disabled title={application.protectedReason ?? text('受 macOS 保护', 'Protected by macOS')} aria-label={application.protectedReason ?? text('受 macOS 保护', 'Protected by macOS')}>
                    <LockKeyhole size={14} />
                  </button>
                )}
              </div>
              {removingId === application.id && <div className="app-removing-status" role="status"><LoaderCircle className="spinner" size={18} /><strong>{text('正在卸载', 'Uninstalling')}</strong></div>}
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-filter is-visible"><div><strong>{text('没有匹配的应用', 'No matching applications')}</strong><p>{text('调整搜索或筛选条件。', 'Change the search or filter.')}</p></div></div>
      )}
    </section>
  )
}
