export function shouldKeepWindowInTray(isQuitting: boolean, closeToTray: boolean): boolean {
  return closeToTray && !isQuitting
}
