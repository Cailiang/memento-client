export type HealthReviewTab = 'storage' | 'services' | 'terminal'

export interface HealthReviewTarget {
  tab: HealthReviewTab
  count: number
}

export function selectHealthReviewTarget(counts: Record<HealthReviewTab, number>): HealthReviewTarget {
  return (['storage', 'services', 'terminal'] as const).reduce<HealthReviewTarget>(
    (target, tab) => counts[tab] > target.count ? { tab, count: counts[tab] } : target,
    { tab: 'storage', count: counts.storage }
  )
}
