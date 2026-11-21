import { useEffect, useState } from 'react'
import type { BackupInfo, BackupStatus } from '../../../shared/types'
import { readableError } from '../lib/errors'
import type { Settings } from '../state/useSettings'
import ConfirmDialog from './ConfirmDialog'

interface Props {
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
}

const formatDate = (ms: number) => new Date(ms).toLocaleString()

// Settings > Backup and restore.
export default function BackupPanel({ settings, onChange }: Props) {
  const [status, setStatus] = useState<BackupStatus | null>(null)
  const [message, setMessage] = useState<{ kind: 'info' | 'error'; text: string } | null>(null)
  const [working, setWorking] = useState(false)
  const [restoring, setRestoring] = useState<BackupInfo | null>(null)
  const [restoreError, setRestoreError] = useState<string | null>(null)

  useEffect(() => {
    window.api.backup
      .status()
      .then(setStatus)
      .catch(() => undefined)
  }, [])

  async function createBackup() {
    setWorking(true)
    setMessage(null)
    try {
      const result = await window.api.backup.create()
      if (result) {
        setMessage({
          kind: 'info',
          text: `Backup saved to ${result.folder} (${result.items} items, ${result.covers} cover pictures).`
        })
      }
    } catch (error) {
      setMessage({ kind: 'error', text: `The backup failed: ${readableError(error)}` })
    }
    setWorking(false)
  }

  async function chooseRestore() {
    setWorking(true)
    setMessage(null)
    try {
      const info = await window.api.backup.pickRestore()
      if (info) {
        setRestoreError(null)
        setRestoring(info)
      }
    } catch (error) {
      setMessage({ kind: 'error', text: readableError(error) })
    }
    setWorking(false)
  }

  async function confirmRestore(info: BackupInfo) {
    setWorking(true)
    setRestoreError(null)
    try {
      await window.api.backup.restore(info.folder) // the app restarts after this
    } catch (error) {
      setRestoreError(readableError(error))
      setWorking(false)
    }
  }

  return (
    <section className="panel">
      <h2>Backup and restore</h2>

      <div className="setting-row">
        <div>
          <div className="setting-name">Back up your library</div>
          <div className="muted small">
            Saves your whole library (items, covers and settings) into a new folder that you
            choose, for example on a USB drive or in a cloud-synced folder. Your actual games,
            videos and comics are not copied, only the library that organizes them.
          </div>
        </div>
        <button type="button" className="btn" onClick={() => void createBackup()} disabled={working}>
          Create backup…
        </button>
      </div>

      <div className="setting-row">
        <div>
          <div className="setting-name">Restore from a backup</div>
          <div className="muted small">
            Choose a backup folder made earlier. Your current library is kept safe in the backups
            folder first, so a restore can always be undone.
          </div>
        </div>
        <button type="button" className="btn" onClick={() => void chooseRestore()} disabled={working}>
          Restore…
        </button>
      </div>

      <div className="setting-row">
        <div>
          <div className="setting-name">Automatic backups</div>
          <div className="muted small">
            Keeps the 5 newest backups, one per day, made when the app starts.
            {status?.lastAutoBackup !== undefined
              ? ` Latest: ${formatDate(status.lastAutoBackup)}.`
              : ' None made yet.'}
          </div>
        </div>
        <div className="segmented">
          {[
            { value: true, label: 'On' },
            { value: false, label: 'Off' }
          ].map((option) => (
            <button
              key={option.label}
              type="button"
              className={`seg-btn seg-text ${settings.autoBackup === option.value ? 'active' : ''}`}
              onClick={() => onChange({ autoBackup: option.value })}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="setting-row">
        <div>
          <div className="setting-name">Backups folder</div>
          <div className="muted small data-path">{status?.backupsFolder ?? '…'}</div>
          <div className="muted small">
            Holds the automatic backups and the safety copies made before a restore or an
            upgrade.
          </div>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => void window.api.backup.openFolder().catch(() => undefined)}
        >
          Open folder
        </button>
      </div>

      {message && (
        <p className={`backup-message ${message.kind === 'error' ? 'error-text' : 'muted'}`}>
          {message.text}
        </p>
      )}

      {restoring && (
        <ConfirmDialog
          title="Restore this backup?"
          confirmLabel="Restore and restart"
          danger
          busy={working}
          error={restoreError}
          onConfirm={() => void confirmRestore(restoring)}
          onClose={() => !working && setRestoring(null)}
        >
          <p>
            <strong>{restoring.items} items</strong>
            {restoring.createdAt !== undefined && <> · made {formatDate(restoring.createdAt)}</>}
          </p>
          <p className="muted data-path">{restoring.folder}</p>
          <p>
            Your current library will be replaced by this backup, and the app will restart. A copy
            of your current library is kept in the backups folder, so nothing is lost.
          </p>
        </ConfirmDialog>
      )}
    </section>
  )
}
