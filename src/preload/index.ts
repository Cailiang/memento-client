import { contextBridge, ipcRenderer } from 'electron'
import type { AgentRunEvent } from '../shared/agent-types'
import type { AppUpdateState, DiskUsageProgress, MementoApi, ScanProgress } from '../shared/types'

const bootTheme = process.argv
  .find((argument) => argument.startsWith('--memento-theme='))
  ?.slice('--memento-theme='.length)
const allowedBootThemes = new Set([
  'porcelain',
  'graphite',
  'tiffany',
  'klein',
  'burgundy',
  'mars',
  'prussian',
  'midnight'
])
if (bootTheme && allowedBootThemes.has(bootTheme)) {
  const applyBootTheme = (): void => {
    if (document.documentElement) document.documentElement.dataset.theme = bootTheme
  }
  if (document.documentElement) applyBootTheme()
  else window.addEventListener('DOMContentLoaded', applyBootTheme, { once: true })
}

const api: MementoApi = {
  getVersion: () => ipcRenderer.invoke('memento:get-version'),
  getUpdateState: () => ipcRenderer.invoke('memento:update:get'),
  checkForUpdates: () => ipcRenderer.invoke('memento:update:check'),
  openUpdatePage: () => ipcRenderer.invoke('memento:update:open'),
  getAppSettings: () => ipcRenderer.invoke('memento:settings:get'),
  updateAppSettings: (input) => ipcRenderer.invoke('memento:settings:update', input),
  scan: (language) => ipcRenderer.invoke('memento:scan', language),
  scanDiskUsage: () => ipcRenderer.invoke('memento:disk-usage:scan'),
  cancelDiskUsageScan: () => ipcRenderer.invoke('memento:disk-usage:cancel'),
  revealDiskUsageNode: (id) => ipcRenderer.invoke('memento:disk-usage:reveal', id),
  trashDiskUsageNode: (id) => ipcRenderer.invoke('memento:disk-usage:trash', id),
  onDiskUsageNodeRemoved: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, id: string): void => callback(id)
    ipcRenderer.on('memento:disk-usage-node-removed', listener)
    return () => ipcRenderer.removeListener('memento:disk-usage-node-removed', listener)
  },
  getApplicationIcon: (id) => ipcRenderer.invoke('memento:get-application-icon', id),
  openApplication: (id) => ipcRenderer.invoke('memento:open-application', id),
  runActions: (ids) => ipcRenderer.invoke('memento:run-actions', ids),
  runTerminalFixes: (ids) => ipcRenderer.invoke('memento:run-terminal-fixes', ids),
  undoTerminalFixes: () => ipcRenderer.invoke('memento:undo-terminal-fixes'),
  revealCandidateLocation: (id) => ipcRenderer.invoke('memento:reveal-candidate-location', id),
  listAgentProviders: () => ipcRenderer.invoke('memento:agent:providers:list'),
  discoverAgentProviderModels: (input) => ipcRenderer.invoke('memento:agent:providers:models', input),
  saveAgentProvider: (input) => ipcRenderer.invoke('memento:agent:providers:save', input),
  deleteAgentProvider: (id) => ipcRenderer.invoke('memento:agent:providers:delete', id),
  setDefaultAgentProvider: (id) => ipcRenderer.invoke('memento:agent:providers:set-default', id),
  testAgentProvider: (input) => ipcRenderer.invoke('memento:agent:providers:test', input),
  importCcSwitchProviders: () => ipcRenderer.invoke('memento:agent:providers:import-cc-switch'),
  startAgentRun: (input) => ipcRenderer.invoke('memento:agent:runs:start', input),
  cancelAgentRun: (runId) => ipcRenderer.invoke('memento:agent:runs:cancel', runId),
  addAgentPlanItems: (input) => ipcRenderer.invoke('memento:agent:plans:add', input),
  executeAgentPlan: (input) => ipcRenderer.invoke('memento:agent:plans:execute', input),
  listAgentRuns: () => ipcRenderer.invoke('memento:agent:runs:list'),
  getAgentRun: (runId) => ipcRenderer.invoke('memento:agent:runs:get', runId),
  deleteAgentRun: (runId) => ipcRenderer.invoke('memento:agent:runs:delete', runId),
  deleteAgentRuns: (runIds) => ipcRenderer.invoke('memento:agent:runs:delete-many', runIds),
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
  onDiskUsageProgress: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: DiskUsageProgress): void => {
      callback(progress)
    }
    ipcRenderer.on('memento:disk-usage-progress', listener)
    return () => ipcRenderer.removeListener('memento:disk-usage-progress', listener)
  },
  onUpdateState: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: AppUpdateState): void => {
      callback(state)
    }
    ipcRenderer.on('memento:update-state', listener)
    return () => ipcRenderer.removeListener('memento:update-state', listener)
  },
  platform: process.platform
}

contextBridge.exposeInMainWorld('memento', api)
