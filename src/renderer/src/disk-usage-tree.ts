import type { DiskUsageNode, DiskUsageScanResult } from '../../shared/types'

interface RemovalResult {
  node: DiskUsageNode
  removed: boolean
  removedSizeBytes: number
}

function removeChild(node: DiskUsageNode, nodeId: string): RemovalResult {
  let removed = false
  let removedSizeBytes = 0
  let directRemovals = 0
  const children = node.children.flatMap((child) => {
    if (child.id === nodeId) {
      removed = true
      removedSizeBytes += child.sizeBytes
      directRemovals += 1
      return []
    }
    const nested = removeChild(child, nodeId)
    if (nested.removed) {
      removed = true
      removedSizeBytes += nested.removedSizeBytes
    }
    return [nested.node]
  })
  if (!removed) return { node, removed: false, removedSizeBytes: 0 }
  return {
    node: {
      ...node,
      sizeBytes: Math.max(0, node.sizeBytes - removedSizeBytes),
      childCount: Math.max(0, node.childCount - directRemovals),
      children
    },
    removed: true,
    removedSizeBytes
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
