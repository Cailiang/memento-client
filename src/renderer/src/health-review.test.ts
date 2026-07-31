import { describe, expect, it } from 'vitest'
import { selectHealthReviewTarget } from './health-review'

describe('selectHealthReviewTarget', () => {
  it('opens the module containing the most findings', () => {
    expect(selectHealthReviewTarget({ storage: 37, services: 1, terminal: 0 }))
      .toEqual({ tab: 'storage', count: 37 })
    expect(selectHealthReviewTarget({ storage: 2, services: 6, terminal: 1 }))
      .toEqual({ tab: 'services', count: 6 })
    expect(selectHealthReviewTarget({ storage: 1, services: 2, terminal: 4 }))
      .toEqual({ tab: 'terminal', count: 4 })
  })

  it('uses the broad Storage module when counts are tied', () => {
    expect(selectHealthReviewTarget({ storage: 3, services: 3, terminal: 2 }))
      .toEqual({ tab: 'storage', count: 3 })
  })
})
