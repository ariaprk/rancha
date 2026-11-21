import { useState } from 'react'
import {
  CARD_SIZE_RANGE,
  UI_SCALE_RANGE,
  type CornerStyle,
  type GlassLevel,
  type IconTone,
  type ReaderFit,
  type ReaderLayout
} from '../../../shared/settings'
import type { AppInfo, MotionLevel, ReadingDirection, ThemeMode } from '../../../shared/types'
import type { Settings } from '../state/useSettings'
import BackupPanel from './BackupPanel'
import EmulatorsPanel from './EmulatorsPanel'
import { ACCENT_PRESETS } from '../lib/accent'

interface Props {
  settings: Settings
  appInfo: AppInfo | null
  onChange: (patch: Partial<Settings>) => void
  onReset: () => void
}


type Tab = 'look' | 'library' | 'data'
const TABS: { value: Tab; label: string }[] = [
  { value: 'look', label: 'Look and feel' },
  { value: 'library', label: 'Games, reading and online' },
  { value: 'data', label: 'Backup and about' }
]
const TAB_KEY = 'library.settingsTab'

function firstTab(): Tab {
  try {
    const saved = localStorage.getItem(TAB_KEY)
    if (saved === 'look' || saved === 'library' || saved === 'data') return saved
  } catch {
    // Browser storage can be unavailable: start on the first tab.
  }
  return 'look'
}

export default function SettingsPage({ settings, appInfo, onChange, onReset }: Props) {
  const [tab, setTab] = useState<Tab>(firstTab)
  function chooseTab(next: Tab) {
    setTab(next)
    try {
      localStorage.setItem(TAB_KEY, next)
    } catch {
      // Not important.
    }
  }
  return (
    <div className="settings">
      <h1 className="page-title">Settings</h1>
      <p className="muted">
        Changes apply immediately and are saved automatically. They are included in backups.
      </p>

      <div className="settings-tabs" role="tablist">
        {TABS.map((entry) => (
          <button
            key={entry.value}
            type="button"
            role="tab"
            aria-selected={tab === entry.value}
            className={`settings-tab ${tab === entry.value ? 'active' : ''}`}
            onClick={() => chooseTab(entry.value)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === 'look' && (
        <>
      <section className="panel">
        <h2>Appearance</h2>

        <div className="setting-row">
          <div>
            <div className="setting-name">Theme</div>
            <div className="muted small">Dark is the default. Light is plain; Airy is a bright, frosted-glass look.</div>
          </div>
          <Segmented<ThemeMode>
            value={settings.theme}
            options={[
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
              { value: 'airy', label: 'Airy' }
            ]}
            onChange={(theme) => onChange({ theme })}
          />
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-name">Accent color</div>
            <div className="muted small">Used for highlights, selection and glow.</div>
          </div>
          <div className="swatches">
            {ACCENT_PRESETS.map((preset) => (
              <button
                key={preset.main}
                type="button"
                className={`swatch ${settings.accent.toLowerCase() === preset.main ? 'active' : ''}`}
                style={{ background: `linear-gradient(135deg, ${preset.from}, ${preset.to})` }}
                onClick={() => onChange({ accent: preset.main })}
                aria-label={`Accent ${preset.name}`}
                title={preset.name}
              />
            ))}
            <input
              type="color"
              className="swatch-custom"
              value={settings.accent}
              onChange={(e) => onChange({ accent: e.target.value })}
              aria-label="Custom accent color"
              title="Custom color"
            />
          </div>
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-name">Icon color</div>
            <div className="muted small">Sidebar and Big Picture icons: the accent gradient, plain white or black, or a different color for each section.</div>
          </div>
          <Segmented<IconTone>
            value={settings.iconTone}
            options={[
              { value: 'accent', label: 'Accent' },
              { value: 'white', label: 'White' },
              { value: 'black', label: 'Black' },
              { value: 'colorful', label: 'Colorful' }
            ]}
            onChange={(iconTone) => onChange({ iconTone })}
          />
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-name">Card size</div>
            <div className="muted small">Width of covers in the grid ({settings.cardSize}px).</div>
          </div>
          <input
            type="range"
            min={CARD_SIZE_RANGE.min}
            max={CARD_SIZE_RANGE.max}
            step={5}
            value={settings.cardSize}
            onChange={(e) => onChange({ cardSize: Number(e.target.value) })}
            aria-label="Card size"
          />
        </div>
      </section>

      <section className="panel">
        <h2>Layout and style</h2>

        <div className="setting-row">
          <div>
            <div className="setting-name">Interface size</div>
            <div className="muted small">
              Makes everything bigger or smaller ({settings.uiScale}%). Handy on large or
              high-resolution screens.
            </div>
          </div>
          <input
            type="range"
            min={UI_SCALE_RANGE.min}
            max={UI_SCALE_RANGE.max}
            step={5}
            value={settings.uiScale}
            onChange={(e) => onChange({ uiScale: Number(e.target.value) })}
            aria-label="Interface size"
          />
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-name">Corners</div>
            <div className="muted small">How rounded covers, buttons and panels are.</div>
          </div>
          <Segmented<CornerStyle>
            value={settings.corners}
            options={[
              { value: 'sharp', label: 'Sharp' },
              { value: 'soft', label: 'Soft' },
              { value: 'round', label: 'Round' }
            ]}
            onChange={(corners) => onChange({ corners })}
          />
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-name">Frosted glass</div>
            <div className="muted small">
              The blur behind the sidebar and toolbar. Turn it off on older PCs for a more solid
              look.
            </div>
          </div>
          <Segmented<GlassLevel>
            value={settings.glass}
            options={[
              { value: 'off', label: 'Off' },
              { value: 'normal', label: 'Normal' },
              { value: 'strong', label: 'Strong' }
            ]}
            onChange={(glass) => onChange({ glass })}
          />
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-name">Background glow</div>
            <div className="muted small">A soft light in your accent color behind everything.</div>
          </div>
          <Segmented<'on' | 'off'>
            value={settings.ambientGlow ? 'on' : 'off'}
            options={[
              { value: 'on', label: 'On' },
              { value: 'off', label: 'Off' }
            ]}
            onChange={(value) => onChange({ ambientGlow: value === 'on' })}
          />
        </div>
      </section>

      <section className="panel">
        <h2>Animations</h2>
        <div className="setting-row">
          <div>
            <div className="setting-name">Sounds</div>
            <div className="muted small">Soft clicks, pops and whooshes for actions and transitions. Off by default.</div>
          </div>
          <Segmented<'on' | 'off'>
            value={settings.sounds ? 'on' : 'off'}
            options={[
              { value: 'on', label: 'On' },
              { value: 'off', label: 'Off' }
            ]}
            onChange={(value) => onChange({ sounds: value === 'on' })}
          />
        </div>
        <div className="setting-row">
          <div>
            <div className="setting-name">Motion</div>
            <div className="muted small">
              Full: hover grow, glow and fades. Subtle: gentler. Off: no animation at all.
            </div>
          </div>
          <Segmented<MotionLevel>
            value={settings.motion}
            options={[
              { value: 'full', label: 'Full' },
              { value: 'subtle', label: 'Subtle' },
              { value: 'off', label: 'Off' }
            ]}
            onChange={(motion) => onChange({ motion })}
          />
        </div>
      </section>

      <button type="button" className="btn" onClick={onReset}>
        Reset appearance to defaults
      </button>
        </>
      )}

      {tab === 'library' && (
        <>
      <section className="panel">
        <h2>Comic reader</h2>
        <div className="setting-row">
          <div>
            <div className="setting-name">Page layout</div>
            <div className="muted small">Also changeable inside the reader.</div>
          </div>
          <Segmented<ReaderLayout>
            value={settings.readerLayout}
            options={[
              { value: 'single', label: 'Single' },
              { value: 'double', label: 'Double' },
              { value: 'scroll', label: 'Strip' }
            ]}
            onChange={(readerLayout) => onChange({ readerLayout })}
          />
        </div>
        <div className="setting-row">
          <div>
            <div className="setting-name">Page size</div>
          </div>
          <Segmented<ReaderFit>
            value={settings.readerFit}
            options={[
              { value: 'page', label: 'Fit page' },
              { value: 'width', label: 'Fit width' }
            ]}
            onChange={(readerFit) => onChange({ readerFit })}
          />
        </div>
        <div className="setting-row">
          <div>
            <div className="setting-name">Reading direction for new comics</div>
            <div className="muted small">
              Each comic remembers its own direction once you have opened it. Manga reads right to
              left.
            </div>
          </div>
          <Segmented<ReadingDirection>
            value={settings.readerDirection}
            options={[
              { value: 'ltr', label: 'Left to right' },
              { value: 'rtl', label: 'Right to left' }
            ]}
            onChange={(readerDirection) => onChange({ readerDirection })}
          />
        </div>
      </section>

      <EmulatorsPanel emulators={settings.emulators} onChange={(emulators) => onChange({ emulators })} />

      <section className="panel">
        <h2>Online sources</h2>
        <div className="setting-row">
          <div>
            <div className="setting-name">SteamGridDB API key</div>
            <div className="muted small">
              Lets you search covers and wallpapers online (in an item's edit window: Search online). Free: make an
              account at steamgriddb.com, then copy the key from your preferences. It stays on this computer.
              The app only goes online when you press Search.
            </div>
          </div>
          <input
            type="password"
            className="api-key-input"
            value={settings.steamGridDbKey}
            onChange={(event) => onChange({ steamGridDbKey: event.target.value.trim() })}
            placeholder="Paste key here"
            maxLength={80}
            autoComplete="off"
            spellCheck={false}
            aria-label="SteamGridDB API key"
          />
        </div>
      </section>

        </>
      )}

      {tab === 'data' && (
        <>
      <BackupPanel settings={settings} onChange={onChange} />

      <section className="panel">
        <h2>About and your data</h2>
        <div className="setting-row">
          <div>
            <div className="setting-name">{appInfo?.name ?? 'Rancha'}</div>
            <div className="muted small">Version {appInfo?.version ?? '…'} · © 2026 Aria Sama</div>
          </div>
        </div>
        <div className="setting-row">
          <div>
            <div className="setting-name">Credits</div>
            <div className="muted small">Icons by sonnycandra, Good Ware and Flaticon from www.flaticon.com. Interface font: Poppins.</div>
          </div>
        </div>
        <div className="setting-row">
          <div>
            <div className="setting-name">Library data folder</div>
            <div className="muted small data-path">{appInfo?.dataFolder ?? '…'}</div>
            <div className="muted small">
              Your library is saved here automatically after every change.
            </div>
          </div>
        </div>
      </section>
        </>
      )}
    </div>
  )
}

interface SegmentedProps<T extends string> {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}

function Segmented<T extends string>({ value, options, onChange }: SegmentedProps<T>) {
  return (
    <div className="segmented">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`seg-btn seg-text ${option.value === value ? 'active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
