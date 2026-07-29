import {
  AppWindow,
  ExternalLink,
  LoaderCircle,
  Search,
  Sparkles,
  Trash2
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { InstalledApplication } from '../../../shared/types'
import { useI18n } from '../i18n'
import { formatBytes, relativeDate } from './utils'

export type ApplicationFilter = 'all' | 'recent' | 'unused'
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
    .filter((application) => (
      application.action && !application.protectedReason && application.scope !== 'system'
    ))
    .filter((application) => !query || [
      application.name,
      application.bundleId ?? '',
      application.location
    ].join(' ').toLocaleLowerCase().includes(query))
    .filter((application) => (
      filter === 'all' || (filter === 'unused' ? application.unused : !application.unused)
    ))
    .sort((left, right) => {
      if (sort === 'size') return right.sizeBytes - left.sizeBytes
      if (sort === 'name') return left.name.localeCompare(right.name, language)
      const leftTime = left.lastUsedAt ? new Date(left.lastUsedAt).getTime() : 0
      const rightTime = right.lastUsedAt ? new Date(right.lastUsedAt).getTime() : 0
      return rightTime - leftTime
    })
}

function ApplicationIcon({ application }: { application: InstalledApplication }): React.JSX.Element {
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
  onOpen,
  onUninstall,
  onAgentPrompt
}: {
  applications: InstalledApplication[]
  openingId: string | null
  onOpen: (application: InstalledApplication) => void
  onUninstall: (application: InstalledApplication) => void
  onAgentPrompt: (prompt: string) => void
}): React.JSX.Element {
  const { language, text } = useI18n()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<ApplicationFilter>('all')
  const [sort, setSort] = useState<ApplicationSort>('recent')
  const manageable = applications.filter((application) => application.action && !application.protectedReason && application.scope !== 'system')
  const totalBytes = manageable.reduce((sum, application) => sum + application.sizeBytes, 0)
  const filtered = useMemo(
    () => filterAndSortApplications(applications, search, filter, sort, language),
    [applications, filter, language, search, sort]
  )

  return (
    <section className="page content-page is-active">
      <header className="page-heading">
        <div><h1>{text('应用管理', 'Applications')}</h1><p>{text(`共 ${manageable.length} 个可管理应用，占用 ${formatBytes(totalBytes)}。`, `${manageable.length} manageable applications using ${formatBytes(totalBytes)}.`)}</p></div>
        <div className="page-heading-actions">
          <button type="button" className="secondary-button" onClick={() => onAgentPrompt(text('帮我检查长期没用的应用和可以安全清理的应用残留', 'Find unused applications and safe application leftovers'))}>
            <Sparkles size={16} />{text('Agent 分析', 'Agent analysis')}
          </button>
        </div>
      </header>

      <div className="toolbar">
        <label className="search-field">
          <Search size={16} />
          <input type="search" placeholder={text('搜索应用名称', 'Search applications')} aria-label={text('搜索应用名称', 'Search applications')} value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        <select aria-label={text('筛选应用', 'Filter applications')} value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
          <option value="all">{text('全部应用', 'All applications')}</option>
          <option value="recent">{text('最近使用', 'Recently used')}</option>
          <option value="unused">{text('3 个月未使用', 'Unused for 3 months')}</option>
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
            <article className="app-card" key={application.id}>
              <ApplicationIcon application={application} />
              <div className="app-title"><strong title={application.name}>{application.name}</strong><small>{text(`版本 ${application.version || '未知'}`, `Version ${application.version || 'unknown'}`)}</small></div>
              <div className="app-meta">
                <div><span>{text('最后使用', 'Last used')}</span><strong>{relativeDate(application.lastUsedAt, language)}</strong></div>
                <div><span>{text('大小', 'Size')}</span><strong>{formatBytes(application.sizeBytes)}</strong></div>
              </div>
              <div className="app-actions">
                <button type="button" className="secondary-button" onClick={() => onOpen(application)} disabled={openingId === application.id}>
                  {openingId === application.id ? <LoaderCircle className="spinner" size={14} /> : <ExternalLink size={14} />}{text('打开', 'Open')}
                </button>
                <button type="button" className="secondary-button uninstall-app" onClick={() => onUninstall(application)}>
                  <Trash2 size={14} />{text('卸载', 'Uninstall')}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-filter is-visible"><div><strong>{text('没有匹配的应用', 'No matching applications')}</strong><p>{text('调整搜索或筛选条件。', 'Change the search or filter.')}</p></div></div>
      )}
    </section>
  )
}
