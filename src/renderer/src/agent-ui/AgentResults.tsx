import {
  AppWindow,
  Check,
  ExternalLink,
  FolderCog,
  HardDrive,
  ListPlus,
  LoaderCircle,
  RadioTower,
  SquareTerminal
} from 'lucide-react'
import type {
  AgentPresentation,
  AgentResultItem,
  AgentResultOperation
} from '../../../shared/agent-types'
import { useI18n } from '../i18n'
import { ApplicationIcon } from './ApplicationsPage'
import { formatBytes, relativeDate } from './utils'

function operationButton(
  operation: AgentResultOperation,
  plannedIds: Set<string>,
  addingId: string | null,
  onAddPlanItem: (id: string) => void,
  added: string,
  add: string
): React.JSX.Element {
  const planned = plannedIds.has(operation.id)
  const busy = addingId === operation.id
  return (
    <button
      type="button"
      className="secondary-button"
      disabled={planned || busy}
      onClick={() => onAddPlanItem(operation.id)}
      title={operation.consequence}
    >
      {busy
        ? <LoaderCircle className="spinner" size={12} />
        : planned ? <Check size={12} /> : <ListPlus size={12} />}
      {planned ? added : operation.label || add}
    </button>
  )
}

function ResultIcon({ item }: { item: AgentResultItem }): React.JSX.Element {
  if (item.kind === 'applications') return <AppWindow size={15} />
  if (item.kind === 'services') return <RadioTower size={15} />
  if (item.kind === 'terminal') return <SquareTerminal size={15} />
  return item.name.toLocaleLowerCase().includes('cache') || item.name.includes('缓存')
    ? <FolderCog size={15} />
    : <HardDrive size={15} />
}

export function AgentResults({
  presentation,
  plannedIds,
  addingOperationId,
  openingApplicationId,
  onOpenApplication,
  onAddPlanItem
}: {
  presentation: AgentPresentation
  plannedIds: Set<string>
  addingOperationId: string | null
  openingApplicationId: string | null
  onOpenApplication: (id: string) => void
  onAddPlanItem: (id: string) => void
}): React.JSX.Element {
  const { language, text } = useI18n()

  return (
    <div className="agent-results">
      {presentation.sections.map((section, sectionIndex) => {
        const bytes = section.items.reduce((sum, item) => (
          sum + (item.kind === 'terminal' ? 0 : item.sizeBytes)
        ), 0)
        return (
          <section className="agent-result-section" key={`${section.kind}-${sectionIndex}`}>
            <header className="agent-result-head">
              <strong>{section.title}</strong>
              <span>{bytes > 0
                ? text(`${section.items.length} 项 · ${formatBytes(bytes)}`, `${section.items.length} items · ${formatBytes(bytes)}`)
                : text(`${section.items.length} 项`, `${section.items.length} items`)}</span>
            </header>
            {section.kind === 'applications' ? (
              <div className="agent-app-results">
                {section.items.map((item) => item.kind === 'applications' && (
                  <article className="agent-app-result" key={item.id}>
                    <ApplicationIcon application={item} />
                    <div className="agent-result-copy">
                      <strong title={item.name}>{item.name}</strong>
                      <small>{text(
                        `${relativeDate(item.lastUsedAt, language)}使用 · ${formatBytes(item.sizeBytes)}`,
                        `Used ${relativeDate(item.lastUsedAt, language).toLocaleLowerCase()} · ${formatBytes(item.sizeBytes)}`
                      )}</small>
                    </div>
                    <div className="agent-result-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={openingApplicationId === item.id}
                        onClick={() => onOpenApplication(item.id)}
                      >
                        {openingApplicationId === item.id
                          ? <LoaderCircle className="spinner" size={12} />
                          : <ExternalLink size={12} />}
                        {text('打开', 'Open')}
                      </button>
                      {item.operation && operationButton(
                        item.operation,
                        plannedIds,
                        addingOperationId,
                        onAddPlanItem,
                        text('已加入', 'Added'),
                        text('加入计划', 'Add to plan')
                      )}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div>
                {section.items.map((item) => item.kind !== 'applications' && (
                  <article className="agent-result-row" key={item.id}>
                    <span className="agent-result-icon"><ResultIcon item={item} /></span>
                    <div className="agent-result-copy">
                      <strong title={item.kind === 'terminal' ? item.title : item.name}>
                        {item.kind === 'terminal' ? item.title : item.name}
                      </strong>
                      <small>{item.kind === 'terminal'
                        ? [item.detail, item.source].filter(Boolean).join(' · ')
                        : [item.status, item.description, item.location].filter(Boolean).join(' · ')}</small>
                    </div>
                    <div className="agent-result-actions">
                      {item.kind === 'terminal'
                        ? item.operation && operationButton(
                            item.operation,
                            plannedIds,
                            addingOperationId,
                            onAddPlanItem,
                            text('已加入', 'Added'),
                            text('加入计划', 'Add to plan')
                          )
                        : item.operations.map((operation) => operationButton(
                            operation,
                            plannedIds,
                            addingOperationId,
                            onAddPlanItem,
                            text('已加入', 'Added'),
                            text('加入计划', 'Add to plan')
                          ))}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
