// Settings > Emulators: the programs that run console games. Kept simple:
// pick an emulator from the list, point to its program, done. Names and
// command-line arguments live under "Advanced" and are rarely needed.
import { useState } from 'react'
import { EMULATOR_PRESETS, MAX_EMULATORS, newProfile, type EmulatorProfile } from '../../../shared/emulators'
import { readableError } from '../lib/errors'

interface Props {
  emulators: EmulatorProfile[]
  onChange: (emulators: EmulatorProfile[]) => void
}

export default function EmulatorsPanel({ emulators, onChange }: Props) {
  const [presetId, setPresetId] = useState(EMULATOR_PRESETS[0].id)
  const [error, setError] = useState<string | null>(null)

  async function pickProgram(): Promise<string | null> {
    setError(null)
    try {
      const picked = await window.api.dialogs.pickTarget('launchable', 'file')
      return picked ? picked.path : null
    } catch (caught) {
      setError(readableError(caught))
      return null
    }
  }

  async function add() {
    const preset = EMULATOR_PRESETS.find((candidate) => candidate.id === presetId) ?? EMULATOR_PRESETS[0]
    const profile = newProfile(preset, emulators)
    // Ask for the program right away; if you cancel, you can set it later.
    const exe = await pickProgram()
    onChange([...emulators, exe ? { ...profile, exe } : profile])
  }

  async function browse(profile: EmulatorProfile) {
    const exe = await pickProgram()
    if (exe) onChange(emulators.map((entry) => (entry.id === profile.id ? { ...entry, exe } : entry)))
  }

  function change(id: string, patch: Partial<EmulatorProfile>) {
    onChange(emulators.map((profile) => (profile.id === id ? { ...profile, ...patch } : profile)))
  }

  return (
    <section className="panel">
      <h2>Emulators</h2>
      <p className="muted small emu-note">
        For console games (Nintendo, PlayStation…). Add an emulator and point to its program; then pick it when you add
        a game (Add &gt; Console game).
      </p>

      {emulators.length === 0 && <p className="muted emu-empty">No emulators yet.</p>}

      {emulators.map((profile) => (
        <div className="emu-card" key={profile.id}>
          <div className="emu-title">
            <strong>{profile.name}</strong>
            <button type="button" className="btn btn-small" onClick={() => onChange(emulators.filter((p) => p.id !== profile.id))}>
              Remove
            </button>
          </div>
          <div className="emu-program">
            <span className={`emu-path ${profile.exe === '' ? 'unset' : ''}`} title={profile.exe}>
              {profile.exe === '' ? 'Program not chosen yet' : profile.exe}
            </span>
            <button type="button" className={`btn btn-small ${profile.exe === '' ? 'btn-primary' : ''}`} onClick={() => void browse(profile)}>
              {profile.exe === '' ? 'Choose program…' : 'Change…'}
            </button>
          </div>
          {profile.retroarch && <span className="muted small">Cores are read from the “cores” folder next to the program.</span>}
          <details className="emu-advanced">
            <summary>Advanced</summary>
            <label className="field">
              <span className="field-label">Name</span>
              <input type="text" value={profile.name} maxLength={80} onChange={(event) => change(profile.id, { name: event.target.value })} />
            </label>
            <label className="field">
              <span className="field-label">Command-line arguments</span>
              <input
                type="text"
                value={profile.args}
                onChange={(event) => change(profile.id, { args: event.target.value })}
                placeholder='-f "{rom}"'
              />
            </label>
            <label className="field">
              <span className="field-label">Main file inside a game folder (only for games kept as folders)</span>
              <input
                type="text"
                value={profile.entry}
                onChange={(event) => change(profile.id, { entry: event.target.value })}
                placeholder="for example code\*.rpx   (empty = give the folder itself)"
              />
            </label>
            <span className="muted small">
              {'{rom}'} = the game file or folder, {'{entry}'} = the main file found inside the folder{profile.retroarch ? ', {core} = the RetroArch core' : ''}.{' '}
              {profile.preset === 'custom' ? '' : 'These arguments are a starting point and not verified: check the emulator’s documentation if a game does not start.'}
            </span>
          </details>
        </div>
      ))}

      {error && <p className="form-error">{error}</p>}
      {emulators.length < MAX_EMULATORS && (
        <div className="emu-add">
          <select value={presetId} onChange={(event) => setPresetId(event.target.value)} aria-label="Emulator to add">
            {EMULATOR_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name} · {preset.systems}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-small" onClick={() => void add()}>
            Add emulator
          </button>
        </div>
      )}
    </section>
  )
}
