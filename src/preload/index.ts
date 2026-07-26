import { contextBridge, ipcRenderer } from 'electron'
import type { MementoApi, ScanProgress } from '../shared/types'

const api: MementoApi = {
  getVersion: () => ipcRenderer.invoke('memento:get-version'),
  getAppSettings: () => ipcRenderer.invoke('memento:settings:get'),
  updateAppSettings: (input) => ipcRenderer.invoke('memento:settings:update', input),
  scan: (language) => ipcRenderer.invoke('memento:scan', language),
  runActions: (ids) => ipcRenderer.invoke('memento:run-actions', ids),
  runTerminalFixes: (ids) => ipcRenderer.invoke('memento:run-terminal-fixes', ids),
  undoTerminalFixes: () => ipcRenderer.invoke('memento:undo-terminal-fixes'),
  revealCandidateLocation: (id) => ipcRenderer.invoke('memento:reveal-candidate-location', id),
  getAiSettings: () => ipcRenderer.invoke('memento:ai:get-settings'),
  updateAiSettings: (input) => ipcRenderer.invoke('memento:ai:update-settings', input),
  testAiProvider: (providerId) => ipcRenderer.invoke('memento:ai:test-provider', providerId),
  prepareTerminalAnalysis: (scanId) =>
    ipcRenderer.invoke('memento:ai:prepare-terminal-analysis', scanId),
  prepareCandidateAnalysis: (input) =>
    ipcRenderer.invoke('memento:ai:prepare-candidate-analysis', input),
  analyzeTerminal: (input) => ipcRenderer.invoke('memento:ai:analyze-terminal', input),
  analyzeCandidate: (input) => ipcRenderer.invoke('memento:ai:analyze-candidate', input),
  cancelAnalysis: (requestId) => ipcRenderer.invoke('memento:ai:cancel-analysis', requestId),
  getHostedSession: () => ipcRenderer.invoke('memento:ai:get-hosted-session'),
  startHostedLogin: () => ipcRenderer.invoke('memento:ai:start-hosted-login'),
  logoutHosted: () => ipcRenderer.invoke('memento:ai:logout-hosted'),
  onScanProgress: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: ScanProgress): void => {
      callback(progress)
    }
    ipcRenderer.on('memento:scan-progress', listener)
    return () => ipcRenderer.removeListener('memento:scan-progress', listener)
  },
  platform: process.platform
}

contextBridge.exposeInMainWorld('memento', api)
