import type { DiskUsageNode, DiskUsageScanResult } from '../../shared/types'

interface RemovalResult {
  node: DiskUsageNode
  removed: boolean
}

function removeChild(node: DiskUsageNode, nodeId: string): RemovalResult {
  let removed = false
  let directRemovals = 0
  const children = node.children.flatMap((child) => {
    if (child.id === nodeId) {
      removed = true
      directRemovals += 1
      return []
    }
    const nested = removeChild(child, nodeId)
    if (nested.removed) removed = true
    return [nested.node]
  })
  if (!removed) return { node, removed: false }
  return {
    node: {
      ...node,
      childCount: Math.max(0, node.childCount - directRemovals),
      children
    },
    removed: true
  }
}

export function withoutDiskUsageNode(
  result: DiskUsageScanResult,
  nodeId: string
): DiskUsageScanResult {
  if (!nodeId || result.root.id === nodeId) return result
  const next = removeChild(result.root, nodeId)
  return next.removed ? { ...result, root: next.node } : result
}
