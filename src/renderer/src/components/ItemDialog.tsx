// The form for adding a new item or editing an existing one.
import { useEffect, useRef, useState, type DragEvent } from 'react'
import { coverUrl } from '../../../shared/cover'
import type { CoverPreview, ItemKind, ItemPatch, LibraryItem } from '../../../shared/types'
import { readableError } from '../lib/errors'
import { firstImage, previewFromImage } from '../lib/imagePreview'
import Cover from './Cover'
import CropDialog, { type CropShape } from './CropDialog'
import { cleanRomName, isAmbiguousRom, type EmulatorProfile } from '../../../shared/emulators'
import NoticeDialog from './NoticeDialog'
import OnlineArtDialog from './OnlineArtDialog'
import type { ArtKind } from '../../../shared/online'
import { KIND_LABEL } from './icons'
import Modal from './Modal'
import PagePickerDialog from './PagePickerDialog'

export type ItemDialogMode =
  | { type: 'create'; kind: ItemKind; parentId: string | null; rom?: boolean } // rom: a console game
  | { type: 'edit'; item: LibraryItem }

interface Props {
  mode: ItemDialogMode
  onClose: () => void
  /** Called after the item was saved (created === true for a new item). */
  onSaved: (item: LibraryItem, created: boolean) => void
  /** Games (apps/games outside the Applications section) can have a wallpaper for the game page. */
  hasWallpaper: boolean
}

const CREATE_TITLES: Record<ItemKind, string> = {
  collection: 'New collection',
  launchable: 'Add an app or game',
  video: 'Add a video',
  readable: 'Add a comic, manga or PDF'
}

const ON_WINDOWS = typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent)

const TARGET_PLACEHOLDERS: Record<ItemKind, string> = ON_WINDOWS
  ? {
      collection: '',
      launchable: 'C:\\Games\\MyGame\\game.exe',
      video: 'C:\\Videos\\episode01.mkv',
      readable: 'C:\\Comics\\volume1.cbz  (or a folder of images)'
    }
  : {
      collection: '',
      launchable: '/home/you/Games/MyGame/start.sh',
      video: '/home/you/Videos/episode01.mkv',
      readable: '/home/you/Comics/volume1.cbz  (or a folder of images)'
    }

function splitTags(text: string): string[] {
  return text.split(',').map((tag) => tag.trim()).filter(Boolean)
}

export default function ItemDialog({ mode, onClose, onSaved, hasWallpaper }: Props) {
  const original = mode.type === 'edit' ? mode.item : null
  const kind: ItemKind = mode.type === 'edit' ? mode.item.kind : mode.kind
  const isCollection = kind === 'collection'
  const coverShape: CropShape = 'cover'
  const romMode = mode.type === 'create' && mode.rom === true // adding a console game
  const canEmulate = hasWallpaper || romMode // games can run with an emulator

  const [name, setName] = useState(original?.name ?? '')
  const [description, setDescription] = useState(original?.description ?? '')
  const [target, setTarget] = useState(original?.target ?? '')
  const [tagsText, setTagsText] = useState(original ? original.tags.join(', ') : '')
  const [hue, setHue] = useState(() => original?.hue ?? Math.floor(Math.random() * 360))
  const [coverFile, setCoverFile] = useState<string | null>(original?.coverFile ?? null)
  const [wallpaperFile, setWallpaperFile] = useState<string | null>(original?.wallpaperFile ?? null)
  const [cropping, setCropping] = useState<{ preview: CoverPreview; shape: CropShape } | null>(null) // picture being cropped
  const [online, setOnline] = useState<{ kind: ArtKind; keys: { steamGridDbKey: boolean; tmdbKey: boolean } } | null>(null) // online artwork search
  // Emulators (games only): which profile runs this ROM, and the RetroArch core.
  const [emulator, setEmulator] = useState<string>(original?.emulator ?? '')
  const [core, setCore] = useState<string>(original?.core ?? '')
  const [profiles, setProfiles] = useState<EmulatorProfile[]>([])
  const [cores, setCores] = useState<{ core: string; likely: boolean }[]>([])
  const [missing, setMissing] = useState<'emulator' | 'core' | null>(null) // a required field that is empty
  const [notice, setNotice] = useState<string | null>(null) // small popup explaining it
  const emulatorField = useRef<HTMLDivElement>(null)
  const [pickingPage, setPickingPage] = useState(false) // choosing a page of the book as the cover
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function browse(pickMode: 'file' | 'folder') {
    setError(null)
    try {
      const picked = await window.api.dialogs.pickTarget(kind, pickMode, romMode || emulator !== '' ? 'rom' : undefined)
      if (!picked) return
      setTarget(picked.path)
      if (name.trim() === '') setName(romMode || emulator !== '' ? cleanRomName(picked.suggestedName) : picked.suggestedName)
    } catch (caught) {
      setError(readableError(caught))
    }
  }

  // A picture pasted (Ctrl+V) or dropped onto the cover goes to the crop step.
  const [coverDropOver, setCoverDropOver] = useState(false)

  const [wallpaperDropOver, setWallpaperDropOver] = useState(false)

  async function useCoverPicture(file: Blob, shape: CropShape = coverShape) {
    setError(null)
    try {
      setCropping({ preview: await previewFromImage(file), shape })
    } catch (caught) {
      setError(readableError(caught))
    }
  }

  useEffect(() => {
    if (!canEmulate) return // only games can use an emulator
    window.api.settings.get().then(
      ({ settings }) => {
        setProfiles(settings.emulators)
      },
      () => undefined
    )
  }, [canEmulate]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedProfile = profiles.find((profile) => profile.id === emulator)
  const isRetroArch = selectedProfile?.retroarch === true
  useEffect(() => {
    if (!isRetroArch) {
      setCores([])
      return
    }
    let cancelled = false
    window.api.emulators.cores(emulator, target.trim() === '' ? null : target.trim()).then(
      (found) => {
        if (cancelled) return
        setCores(found)
        // No core chosen yet: take the most likely one, but never guess for files that fit several consoles (.iso, .chd...).
        setCore((current) => (current !== '' || isAmbiguousRom(target.trim()) ? current : found.find((entry) => entry.likely)?.core ?? ''))
      },
      () => !cancelled && setCores([])
    )
    return () => {
      cancelled = true
    }
  }, [emulator, isRetroArch, target])

  const canTakePicture = !cropping && !pickingPage && !online
  useEffect(() => {
    if (!canTakePicture) return
    function onPaste(event: ClipboardEvent) {
      const picture = firstImage(Array.from(event.clipboardData?.files ?? []))
      if (!picture) return // ordinary text pasting is left alone
      event.preventDefault()
      void useCoverPicture(picture)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canTakePicture])

  const hasFiles = (event: DragEvent) => event.dataTransfer.types.includes('Files')

  async function chooseCover() {
    setError(null)
    try {
      const preview = await window.api.dialogs.pickCoverImage()
      if (preview) setCropping({ preview, shape: coverShape }) // the crop step decides what is saved
    } catch (caught) {
      setError(readableError(caught))
    }
  }

  async function searchOnline(kind: ArtKind) {
    setError(null)
    try {
      const { settings } = await window.api.settings.get()
      setOnline({ kind, keys: { steamGridDbKey: settings.steamGridDbKey.trim() !== '', tmdbKey: settings.tmdbKey.trim() !== '' } })
    } catch (caught) {
      setError(readableError(caught))
    }
  }

  async function chooseWallpaper() {
    setError(null)
    try {
      const preview = await window.api.dialogs.pickCoverImage()
      if (preview) setCropping({ preview, shape: 'wallpaper' })
    } catch (caught) {
      setError(readableError(caught))
    }
  }

  async function save() {
    const trimmedName = name.trim()
    if (trimmedName === '') {
      setError('Please enter a name.')
      return
    }
    // A console game never gets an emulator by default: the user must choose it.
    if (romMode && emulator === '') {
      setMissing('emulator')
      setNotice(profiles.length === 0 ? 'There is no emulator yet. Add one in Settings > Emulators, then choose it here.' : 'Choose the emulator that runs this game.')
      return
    }
    if (romMode && isRetroArch && core === '') {
      setMissing('core')
      setNotice('Choose the RetroArch core that runs this game.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const tags = splitTags(tagsText)
      const trimmedDescription = description.trim()
      const trimmedTarget = target.trim()

      if (mode.type === 'create') {
        const created = await window.api.library.create({
          parentId: mode.parentId,
          kind,
          name: trimmedName,
          description: trimmedDescription === '' ? undefined : trimmedDescription,
          target: isCollection || trimmedTarget === '' ? undefined : trimmedTarget,
          tags,
          hue,
          coverFile: coverFile ?? undefined,
          wallpaperFile: hasWallpaper ? wallpaperFile ?? undefined : undefined,
          emulator: canEmulate && emulator !== '' ? emulator : undefined,
          core: canEmulate && emulator !== '' && isRetroArch && core !== '' ? core : undefined
        })
        onSaved(created, true)
      } else {
        const patch: ItemPatch = {
          name: trimmedName,
          description: trimmedDescription === '' ? null : trimmedDescription,
          tags,
          hue
        }
        if (!isCollection) patch.target = trimmedTarget === '' ? null : trimmedTarget
        if (coverFile !== (mode.item.coverFile ?? null)) patch.coverFile = coverFile
        if (hasWallpaper && wallpaperFile !== (mode.item.wallpaperFile ?? null)) patch.wallpaperFile = wallpaperFile
        if (canEmulate && profiles.length + (original?.emulator ? 1 : 0) > 0) {
          const newCore = emulator !== '' && isRetroArch && core !== '' ? core : null
          if (emulator !== (original?.emulator ?? '')) patch.emulator = emulator === '' ? null : emulator
          if (newCore !== (original?.core ?? null)) patch.core = newCore
        }
        const updated = await window.api.library.update(mode.item.id, patch)
        onSaved(updated, false)
      }
    } catch (caught) {
      setError(readableError(caught))
      setBusy(false)
    }
  }

  const title = original ? `Edit “${original.name}”` : romMode ? 'Add a console game (ROM)' : kind === 'launchable' ? 'Add a PC game or app' : CREATE_TITLES[kind]

  return (
    <>
    <Modal
      title={title}
      onClose={onClose}
      width={640}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="item-form" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : original ? 'Save' : 'Add'}
          </button>
        </>
      }
    >
      <form
        id="item-form"
        className="item-form"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <div className="form-cover">
          <div
            className={`form-cover-art ${coverDropOver ? 'drop-over' : ''}`}
            onDragEnter={(event) => {
              if (!hasFiles(event)) return
              event.preventDefault()
              setCoverDropOver(true)
            }}
            onDragOver={(event) => {
              if (!hasFiles(event)) return
              event.preventDefault()
              event.dataTransfer.dropEffect = 'copy'
            }}
            onDragLeave={() => setCoverDropOver(false)}
            onDrop={(event) => {
              if (!hasFiles(event)) return
              event.preventDefault()
              event.stopPropagation()
              setCoverDropOver(false)
              const picture = firstImage(Array.from(event.dataTransfer.files))
              if (picture) void useCoverPicture(picture)
              else setError('Drop a picture file (PNG, JPG, WebP…) here.')
            }}
          >
            <Cover
              item={{
                // The saved item's first page is shown only while its location is unchanged.
                id: original && target.trim() === (original.target ?? '') ? original.id : undefined,
                kind,
                name: name.trim() || 'Untitled',
                hue,
                coverFile: coverFile ?? undefined,
                target: target.trim() || undefined
              }}
            />
          </div>
          <button type="button" className="btn btn-small" onClick={() => void chooseCover()}>
            Choose image…
          </button>
          {kind !== 'collection' && (
            <button type="button" className="btn btn-small" onClick={() => void searchOnline('cover')}>
              Search online…
            </button>
          )}
          <span className="muted small form-cover-tip">or paste (Ctrl+V) / drop a picture on the cover</span>
          {kind === 'readable' && target.trim() !== '' && (
            <button
              type="button"
              className="btn btn-small"
              onClick={() => setPickingPage(true)}
              title="Use one of the book's own pages (for example when the first page is an advertisement)"
            >
              Choose a page from the book…
            </button>
          )}
          {coverFile !== null && (
            <button type="button" className="btn btn-small" onClick={() => setCoverFile(null)}>
              Remove image
            </button>
          )}
          {coverFile === null && (
            <label className="hue-field" title="Color of the placeholder cover">
              <span className="muted small">Color</span>
              <input
                type="range"
                className="hue-slider"
                min={0}
                max={359}
                step={1}
                value={hue}
                onChange={(event) => setHue(Number(event.target.value))}
                aria-label="Placeholder color"
              />
            </label>
          )}
        </div>

        <div className="form-fields">
          <div className="muted small">{KIND_LABEL[kind]}</div>

          <label className="field">
            <span className="field-label">Name</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={200}
              autoFocus
            />
          </label>

          {!isCollection && (
            <div className="field">
              <span className="field-label">Location</span>
              <div className="field-row">
                <input
                  type="text"
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                  placeholder={romMode ? 'D:\\ROMs\\SNES\\game.sfc' : TARGET_PLACEHOLDERS[kind]}
                  aria-label="Location"
                />
                <button type="button" className="btn btn-small" onClick={() => void browse('file')}>
                  Browse…
                </button>
                {(romMode || emulator !== '') && (
                  <button type="button" className="btn btn-small" onClick={() => void browse('folder')} title="For games kept as a folder (Wii U, PS3...)">
                    Choose folder…
                  </button>
                )}
                {kind === 'readable' && (
                  <button type="button" className="btn btn-small" onClick={() => void browse('folder')}>
                    Folder…
                  </button>
                )}
              </div>
              <span className="muted small">
                Your file stays where it is; the library only remembers its location.
              </span>
            </div>
          )}

          {canEmulate && !isCollection && (
            <div className={`field ${missing ? 'field-invalid' : ''}`} ref={emulatorField}>
              <span className="field-label">{romMode ? 'Emulator' : 'Run with'}</span>
              <div className="field-row">
                <select value={emulator} onChange={(event) => { setEmulator(event.target.value); setCore(''); setMissing(null) }} aria-label="Run with" aria-invalid={missing === 'emulator'} className={missing === 'emulator' ? 'invalid' : ''}>
                  {romMode ? (
                    <option value="">Choose an emulator…</option>
                  ) : (
                    <option value="">Run the file directly (a PC game)</option>
                  )}
                  {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                  {emulator !== '' && !selectedProfile && <option value={emulator}>(removed emulator)</option>}
                </select>
                {isRetroArch && (
                  <select value={core} onChange={(event) => { setCore(event.target.value); setMissing(null) }} aria-label="RetroArch core" aria-invalid={missing === 'core'} className={missing === 'core' ? 'invalid' : ''}>
                    <option value="">{cores.length === 0 ? 'No cores found' : 'Choose a core…'}</option>
                    {cores.map((entry) => (
                      <option key={entry.core} value={entry.core}>
                        {entry.likely ? '★ ' : ''}
                        {entry.core.replace(/_libretro\.(dll|so|dylib)$/i, '')}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {missing && (
                <span className="field-warn">
                  <span className="warn-mark" aria-hidden="true">
                    !
                  </span>
                  {missing === 'emulator' ? 'Required: choose an emulator' : 'Required: choose a core'}
                </span>
              )}
              <span className="muted small">
                {profiles.length === 0
                  ? 'For ROMs (Nintendo, PlayStation…): add an emulator first in Settings > Emulators.'
                  : isRetroArch && cores.length === 0
                    ? 'No cores found next to RetroArch. Download one in RetroArch: Online Updater > Core Downloader.'
                    : 'Choose the emulator for a ROM file. ★ marks cores that usually play this kind of file.'}
              </span>
            </div>
          )}

          <label className="field">
            <span className="field-label">Description</span>
            <textarea
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={5000}
            />
          </label>

          {hasWallpaper && (
            <div className="field">
              <span className="field-label">Wallpaper</span>
              <div className="wallpaper-field">
                <div
                  className={`wallpaper-preview ${wallpaperDropOver ? 'drop-over' : ''}`}
                  style={wallpaperFile !== null ? { backgroundImage: `url("${coverUrl(wallpaperFile)}")` } : undefined}
                  onDragEnter={(event) => {
                    if (!hasFiles(event)) return
                    event.preventDefault()
                    setWallpaperDropOver(true)
                  }}
                  onDragOver={(event) => {
                    if (!hasFiles(event)) return
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'copy'
                  }}
                  onDragLeave={() => setWallpaperDropOver(false)}
                  onDrop={(event) => {
                    if (!hasFiles(event)) return
                    event.preventDefault()
                    event.stopPropagation()
                    setWallpaperDropOver(false)
                    const picture = firstImage(Array.from(event.dataTransfer.files))
                    if (picture) void useCoverPicture(picture, 'wallpaper')
                    else setError('Drop a picture file (PNG, JPG, WebP…) here.')
                  }}
                >
                  {wallpaperFile === null && <span className="muted small">No wallpaper. The game screen blurs the cover instead.</span>}
                </div>
                <div className="wallpaper-buttons">
                  <button type="button" className="btn btn-small" onClick={() => void chooseWallpaper()}>
                    Choose image…
                  </button>
                  <button type="button" className="btn btn-small" onClick={() => void searchOnline('wallpaper')}>
                    Search online…
                  </button>
                  {wallpaperFile !== null && (
                    <button type="button" className="btn btn-small" onClick={() => setWallpaperFile(null)}>
                      Remove wallpaper
                    </button>
                  )}
                </div>
              </div>
              <span className="muted small">
                Shown full-screen when you double-click the game. Drop a picture on the box above, or use a 16:9 picture for the best fit.
              </span>
            </div>
          )}

          <label className="field">
            <span className="field-label">Tags</span>
            <input
              type="text"
              value={tagsText}
              onChange={(event) => setTagsText(event.target.value)}
              placeholder="rpg, co-op, favorite series"
            />
            <span className="muted small">Separate tags with commas.</span>
          </label>

          {error && <p className="form-error">{error}</p>}
        </div>
      </form>
    </Modal>
    {pickingPage && (
      <PagePickerDialog
        path={target.trim()}
        onClose={() => setPickingPage(false)}
        onPick={(preview) => {
          setPickingPage(false)
          setCropping({ preview, shape: coverShape })
        }}
      />
    )}
    {notice && (
      <NoticeDialog
        title="Missing information"
        message={notice}
        onClose={() => {
          setNotice(null)
          // Bring the empty field into view and focus it.
          requestAnimationFrame(() => {
            emulatorField.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
            emulatorField.current?.querySelector<HTMLSelectElement>('select.invalid')?.focus({ preventScroll: true })
          })
        }}
      />
    )}
    {online && (
      <OnlineArtDialog
        kind={online.kind}
        initialTerm={name.trim()}
        keys={online.keys}
        itemKind={kind}
        onClose={() => setOnline(null)}
        onPick={(preview) => {
          const shape: CropShape = online.kind === 'wallpaper' ? 'wallpaper' : coverShape
          setOnline(null)
          setCropping({ preview, shape })
        }}
      />
    )}
    {cropping && (
      <CropDialog
        key={cropping.shape}
        shape={cropping.shape}
        preview={cropping.preview}
        onCancel={() => setCropping(null)}
        onDone={(file) => {
          if (cropping.shape === 'wallpaper') setWallpaperFile(file)
          else setCoverFile(file)
          setCropping(null)
        }}
      />
    )}
    </>
  )
}
