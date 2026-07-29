import { contextBridge, ipcRenderer } from 'electron'
import type { AgentRunEvent } from '../shared/agent-types'
import type { MementoApi, ScanProgress } from '../shared/types'

const api: MementoApi = {
  getVersion: () => ipcRenderer.invoke('memento:get-version'),
  getAppSettings: () => ipcRenderer.invoke('memento:settings:get'),
  updateAppSettings: (input) => ipcRenderer.invoke('memento:settings:update', input),
  scan: (language) => ipcRenderer.invoke('memento:scan', language),
  getApplicationIcon: (id) => ipcRenderer.invoke('memento:get-application-icon', id),
  openApplication: (id) => ipcRenderer.invoke('memento:open-application', id),
  runActions: (ids) => ipcRenderer.invoke('memento:run-actions', ids),
  runTerminalFixes: (ids) => ipcRenderer.invoke('memento:run-terminal-fixes', ids),
  undoTerminalFixes: () => ipcRenderer.invoke('memento:undo-terminal-fixes'),
  revealCandidateLocation: (id) => ipcRenderer.invoke('memento:reveal-candidate-location', id),
  listAgentProviders: () => ipcRenderer.invoke('memento:agent:providers:list'),
  saveAgentProvider: (input) => ipcRenderer.invoke('memento:agent:providers:save', input),
  deleteAgentProvider: (id) => ipcRenderer.invoke('memento:agent:providers:delete', id),
  setDefaultAgentProvider: (id) => ipcRenderer.invoke('memento:agent:providers:set-default', id),
  testAgentProvider: (input) => ipcRenderer.invoke('memento:agent:providers:test', input),
  startAgentRun: (prompt) => ipcRenderer.invoke('memento:agent:runs:start', prompt),
  cancelAgentRun: (runId) => ipcRenderer.invoke('memento:agent:runs:cancel', runId),
  executeAgentPlan: (input) => ipcRenderer.invoke('memento:agent:plans:execute', input),
  listAgentRuns: () => ipcRenderer.invoke('memento:agent:runs:list'),
  getAgentRun: (runId) => ipcRenderer.invoke('memento:agent:runs:get', runId),
  onAgentRunEvent: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, runEvent: AgentRunEvent): void => {
      callback(runEvent)
    }
    ipcRenderer.on('memento:agent-run-event', listener)
    return () => ipcRenderer.removeListener('memento:agent-run-event', listener)
  },
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
