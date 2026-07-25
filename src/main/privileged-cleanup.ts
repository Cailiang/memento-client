import path from 'node:path'

export interface PrivilegedMove {
  source: string
  destination: string
}

export function buildPrivilegedMoves(
  stagingDirectory: string,
  targets: readonly string[]
): PrivilegedMove[] {
  return targets.map((source, index) => ({
    source,
    destination: path.join(
      stagingDirectory,
      `${String(index + 1).padStart(3, '0')}-${path.basename(source)}`
    )
  }))
}

export function privilegedMoveArguments(
  uid: number,
  serviceTargets: readonly string[],
  moves: readonly PrivilegedMove[]
): string[] {
  return [
    `gui/${uid}`,
    String(serviceTargets.length),
    ...serviceTargets,
    ...moves.flatMap(({ source, destination }) => [source, destination])
  ]
}
