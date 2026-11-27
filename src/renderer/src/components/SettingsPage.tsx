import { useState } from 'react'
import {
  CARD_SIZE_RANGE,
  UI_SCALE_RANGE,
  type CornerStyle,
  type GlassLevel,
  type IconTone,
  type ReaderFit,
  type MusicOverlay,
  type MusicCorner,
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


type Tab = 'appearance' | 'interface' | 'reading' | 'media' | 'emulators' | 'online' | 'data' | 'about'
const TABS: { value: Tab; label: string }[] = [
  { value: 'appearance', label: 'Appearance' },
  { value: 'interface', label: 'Size and motion' },
  { value: 'reading', label: 'Comic reader' },
  { value: 'media', label: 'Music' },
  { value: 'emulators', label: 'Emulators' },
  { value: 'online', label: 'Online covers' },
  { value: 'data', label: 'Backup' },
  { value: 'about', label: 'About' }
]
const TAB_KEY = 'library.settingsTab'
// Tabs of earlier versions, mapped to the closest new one.
const OLD_TABS: Record<string, Tab> = { look: 'appearance', library: 'reading' }

function firstTab(): Tab {
  try {
    const saved = localStorage.getItem(TAB_KEY) ?? ''
    if (TABS.some((entry) => entry.value === saved)) return saved as Tab
    if (saved in OLD_TABS) return OLD_TABS[saved]
  } catch {
    // Browser storage can be unavailable: start on the first tab.
  }
  return 'appearance'
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
      <p className="muted">Changes apply immediately and are saved automatically. They are included in backups.</p>

      <div className="settings-layout">
        <nav className="settings-nav" role="tablist" aria-label="Settings sections">
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
        </nav>

        <div className="settings-content">
          {tab === 'appearance' && (
            <>
            <section className="panel">
              <h2>Colors</h2>
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
            </section>
            <section className="panel">
              <h2>Shape and effects</h2>
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
              <button type="button" className="btn" onClick={onReset}>
                Reset appearance to defaults
              </button>
            </>
          )}

          {tab === 'interface' && (
            <>
            <section className="panel">
              <h2>Size</h2>
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
              <h2>Animation and sound</h2>
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
            </section>
            </>
          )}

          {tab === 'reading' && (
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
            </>
          )}

          {tab === 'media' && (
            <>
              <section className="panel">
                <h2>Music</h2>
                <div className="setting-row">
                  <div>
                    <div className="setting-name">Small player over other screens</div>
                    <div className="muted small">Shown while a song is loaded. Also changeable from the player itself and from Big Picture.</div>
                  </div>
                  <Segmented<MusicOverlay>
                    value={settings.musicOverlay}
                    options={[
                      { value: 'compact', label: 'Small' },
                      { value: 'expanded', label: 'Expanded' },
                      { value: 'hidden', label: 'Hidden' }
                    ]}
                    onChange={(musicOverlay) => onChange({ musicOverlay })}
                  />
                </div>
                <div className="setting-row">
                  <div>
                    <div className="setting-name">Where it sits</div>
                  </div>
                  <Segmented<MusicCorner>
                    value={settings.musicCorner}
                    options={[
                      { value: 'top-left', label: '↖' },
                      { value: 'top-right', label: '↗' },
                      { value: 'bottom-left', label: '↙' },
                      { value: 'bottom-right', label: '↘' }
                    ]}
                    onChange={(musicCorner) => onChange({ musicCorner })}
                  />
                </div>
                <div className="setting-row">
                  <div>
                    <div className="setting-name">Continue with the next song</div>
                  </div>
                  <input type="checkbox" checked={settings.musicAutoplayNext} onChange={(event) => onChange({ musicAutoplayNext: event.target.checked })} />
                </div>
              </section>
            </>
          )}

          {tab === 'emulators' && (
            <EmulatorsPanel emulators={settings.emulators} onChange={(emulators) => onChange({ emulators })} />
          )}

          {tab === 'online' && (
            <>
            <section className="panel">
              <h2>Online covers and wallpapers</h2>
            <div className="setting-row">
              <div>
                <div className="setting-name">SteamGridDB API key (games)</div>
                <div className="muted small">
                  Free: make an account at steamgriddb.com, then copy the key from your preferences.
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
            <div className="setting-row">
              <div>
                <div className="setting-name">TMDB API key (movies and series)</div>
                <div className="muted small">
                  Free: make an account at themoviedb.org, then Settings &gt; API &gt; request a key (personal use).
                </div>
              </div>
              <input
                type="password"
                className="api-key-input"
                value={settings.tmdbKey}
                onChange={(event) => onChange({ tmdbKey: event.target.value.trim() })}
                placeholder="Paste key here"
                maxLength={600}
                autoComplete="off"
                spellCheck={false}
                aria-label="TMDB API key"
              />
            </div>
            <div className="setting-row">
              <div>
                <div className="setting-name">AniList and TVmaze</div>
                <div className="muted small">Anime, manga and TV series: no key needed.</div>
              </div>
            </div>
            <p className="muted small online-note">
              Keys stay on this computer. The app only goes online when you press Search in an item's edit window (Search online…).
              Pictures come from TMDB, AniList, TVmaze and SteamGridDB. This product uses the TMDB API but is not endorsed or certified by TMDB.
            </p>
            </section>
            </>
          )}

          {tab === 'data' && <BackupPanel settings={settings} onChange={onChange} />}

          {tab === 'about' && (
            <>
              <section className="panel">
                <h2>About</h2>
                <div className="setting-row">
                  <div>
                    <div className="setting-name">{appInfo?.name ?? 'Rancha'}</div>
                    <div className="muted small">Version {appInfo?.version ?? '…'} · © 2026 Aria Sama</div>
                  </div>
                </div>
                <div className="setting-row">
                  <div>
                    <div className="setting-name">Credits</div>
                    <div className="muted small">Icons by sonnycandra and Flaticon from www.flaticon.com. Interface font: Poppins. Movie and series pictures: this product uses the TMDB API but is not endorsed or certified by TMDB.</div>
                  </div>
                </div>
              </section>
              <section className="panel">
                <h2>Your data</h2>
                <div className="setting-row">
                  <div>
                    <div className="setting-name">Library data folder</div>
                    <div className="muted small data-path">{appInfo?.dataFolder ?? '…'}</div>
                    <div className="muted small">Your library is saved here automatically after every change.</div>
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      </div>
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
