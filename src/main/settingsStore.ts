// Keeps the user's settings in a small text file (settings.json) in the app's
// data folder. It is written safely: first to a temporary file, then renamed,
// so a crash in the middle of saving can never leave a half-written file.
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { DEFAULT_SETTINGS, sanitizeSettings, type Settings } from '../shared/settings'

export class SettingsStore {
  private readonly file: string
  private current: Settings
  /** False when there was no usable settings file (first run, or a damaged file). */
  readonly existed: boolean

  constructor(file: string) {
    this.file = file
    let loaded: Settings | null = null
    if (existsSync(file)) {
      try {
        loaded = sanitizeSettings(JSON.parse(readFileSync(file, 'utf8')))
      } catch {
        // Unreadable or damaged: keep it for inspection, start from defaults.
        try {
          renameSync(file, file.replace(/\.json$/, `.damaged-${Date.now()}.json`))
        } catch {
          // Could not move it aside; it will simply be overwritten on the next save.
        }
      }
    }
    this.existed = loaded !== null
    this.current = loaded ?? DEFAULT_SETTINGS
  }

  get(): Settings {
    return this.current
  }

  /** Applies a partial change (invalid values are ignored) and saves it. */
  update(patch: unknown): Settings {
    if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
      throw new Error('Invalid request.')
    }
    this.current = sanitizeSettings({ ...this.current, ...patch }, this.current)
    this.save()
    return this.current
  }

  reset(): Settings {
    // Backup preference and the API key survive a reset of the look and feel.
    this.current = { ...DEFAULT_SETTINGS, autoBackup: this.current.autoBackup, steamGridDbKey: this.current.steamGridDbKey, tmdbKey: this.current.tmdbKey, emulators: this.current.emulators }
    this.save()
    return this.current
  }

  private save(): void {
    const temporary = `${this.file}.tmp`
    writeFileSync(temporary, JSON.stringify(this.current, null, 2), 'utf8')
    renameSync(temporary, this.file)
  }
}
