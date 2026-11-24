// "Add a folder": scans a folder, shows everything found with tick boxes, and
// adds only what is ticked. Nothing is added until "Add" is pressed.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { EmulatorProfile } from '../../../shared/emulators'
import type { FolderScan, ImportNodeInput, ScanContent, ScanNode, TreeImportResult } from '../../../shared/types'
import { readableError } from '../lib/errors'
import {
  buildImport,
  collectionIds,
  countImport,
  defaultsFor,
  filterTree,
  initialChecked,
  leavesOf,
  nextOn,
  searchWords,
  setLeaves,
  setNode,
  stateOf,
  type ImportLayout
} from '../lib/scanTree'
import { KIND_LABEL } from './icons'
import Modal from './Modal'

interface Props {
  folderPath: string
  parentId: string | null
  parentName: string
  /** What the user said the folder contains. */
  content: ScanContent
  /** How many more folders are waiting after this one (dropped several at once). */
  remaining: number
  onClose: () => void
  onImported: (result: TreeImportResult) => void
}

export const CONTENT_CHOICES: { value: ScanContent; label: string; hint: string }[] = [
  { value: 'games', label: 'Games and apps', hint: 'One entry per game: the program that starts it, with its icon' },
  { value: 'roms', label: 'Console games (ROMs)', hint: 'Nintendo, PlayStation…: runs with RetroArch or another emulator' },
  { value: 'videos', label: 'Videos, anime, series', hint: 'Video files, with folders and seasons kept' },
  { value: 'comics', label: 'Comics, manga, books', hint: '.cbz, .cbr, PDF and folders of pictures' },
  { value: 'music', label: 'Music', hint: 'mp3, flac, ogg, wav, m4a… with folders (albums) kept' },
  { value: 'all', label: 'A mix of everything', hint: 'Show every kind of file that can be added' }
]

/** ROM imports: every game gets the emulator and, for RetroArch, its most likely installed core. */
async function withEmulator(nodes: ImportNodeInput[], emulator: string): Promise<ImportNodeInput[]> {
  const paths: string[] = []
  const collect = (list: readonly ImportNodeInput[]): void => {
    for (const node of list) {
      if (node.kind === 'collection') collect(node.children ?? [])
      else if (node.target) paths.push(node.target)
    }
  }
  collect(nodes)
  const cores = await window.api.emulators.coresFor(emulator, paths)
  const apply = (list: readonly ImportNodeInput[]): ImportNodeInput[] =>
    list.map((node) =>
      node.kind === 'collection'
        ? { ...node, children: apply(node.children ?? []) }
        : { ...node, emulator, core: (node.target && cores[node.target]) || undefined }
    )
  return apply(nodes)
}

interface Row {
  node: ScanNode
  depth: number
}

function visibleRows(nodes: readonly ScanNode[], expanded: ReadonlySet<string>, depth = 0): Row[] {
  const rows: Row[] = []
  for (const node of nodes) {
    rows.push({ node, depth })
    if (node.kind === 'collection' && expanded.has(node.id)) {
      rows.push(...visibleRows(node.children ?? [], expanded, depth + 1))
    }
  }
  return rows
}

function TickBox({ state, onChange, label }: { state: 'all' | 'some' | 'none'; onChange: () => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'some'
  }, [state])
  return <input ref={ref} type="checkbox" checked={state === 'all'} onChange={onChange} aria-label={label} />
}

export default function FolderImportDialog({
  folderPath,
  parentId,
  parentName,
  content: initialContent,
  remaining,
  onClose,
  onImported
}: Props) {
  const [content, setContent] = useState<ScanContent>(initialContent)
  const [allPrograms, setAllPrograms] = useState(false)
  const [icons, setIcons] = useState<Record<string, string | null>>({})
  const [subfolders, setSubfolders] = useState(true)
  const [scan, setScan] = useState<FolderScan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [layout, setLayout] = useState<ImportLayout>(() => defaultsFor(initialContent).layout)
  const [wrap, setWrap] = useState(() => defaultsFor(initialContent).wrap)
  const [search, setSearch] = useState('')
  const [wrapName, setWrapName] = useState('')
  const [busy, setBusy] = useState(false)
  const [gameFolders, setGameFolders] = useState(false) // ROMs: each sub-folder is one game
  const [profiles, setProfiles] = useState<EmulatorProfile[]>([])
  const [emulator, setEmulator] = useState('')
  useEffect(() => {
    window.api.settings.get().then(
      ({ settings }) => {
        setProfiles(settings.emulators)
      },
      () => undefined
    )
  }, [])

  // (Re)scan whenever the folder or the "sub-folders" choice changes.
  useEffect(() => {
    let cancelled = false
    setScan(null)
    setError(null)
    window.api.library
      .scanFolder(folderPath, { subfolders, content, allPrograms, gameFolders })
      .then((result) => {
        if (cancelled) return
        setScan(result)
        setChecked(initialChecked(result.nodes))
        setExpanded(new Set())
        setWrapName((current) => (current === '' ? result.rootName : current))
      })
      .catch((problem) => {
        if (!cancelled) setError(readableError(problem))
      })
    return () => {
      cancelled = true
    }
  }, [folderPath, subfolders, content, allPrograms, gameFolders])

  // Fetch the Windows icons of the programs found (a few at a time, in the background).
  useEffect(() => {
    if (!scan) return
    let cancelled = false
    const wanted = leavesOf(scan.nodes)
      .filter((leaf) => leaf.kind === 'launchable' && leaf.target)
      .map((leaf) => leaf.target as string)
      .slice(0, 400)
    async function load() {
      for (let start = 0; start < wanted.length && !cancelled; start += 40) {
        try {
          const batch = await window.api.files.icons(wanted.slice(start, start + 40))
          if (!cancelled) setIcons((current) => ({ ...current, ...batch }))
        } catch {
          return // icons are a nicety; the list works without them
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [scan])

  const words = useMemo(() => searchWords(search), [search])
  const searching = words.length > 0
  // While searching, show only what matches, with every folder on the way opened.
  const shown = useMemo(() => (scan ? filterTree(scan.nodes, words) : []), [scan, words])
  const rows = useMemo(
    () => visibleRows(shown, searching ? new Set(collectionIds(shown)) : expanded),
    [shown, searching, expanded]
  )
  const toImport = useMemo(
    () => (scan ? buildImport(scan.nodes, checked, layout, wrap ? wrapName : null) : []),
    [scan, checked, layout, wrap, wrapName]
  )
  const count = countImport(toImport)
  const total = scan ? leavesOf(scan.nodes).length : 0

  async function add() {
    if (count === 0) return
    if (content === 'roms' && emulator === '') {
      setError('Choose the emulator for these games first (add one in Settings > Emulators).')
      return
    }
    setBusy(true)
    setError(null)
    try {
      let nodes = toImport
      if (content === 'roms') nodes = await withEmulator(toImport, emulator)
      onImported(await window.api.library.importTree(parentId, nodes))
    } catch (problem) {
      setError(readableError(problem))
      setBusy(false)
    }
  }

  function toggleExpanded(id: string) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <Modal
      title="Add a folder"
      onClose={busy ? () => undefined : onClose}
      width={680}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void add()} disabled={busy || count === 0 || (content === 'roms' && emulator === '')}>
            {busy ? 'Adding…' : count === 0 ? 'Nothing selected' : content === 'roms' && emulator === '' ? 'Choose an emulator first' : `Add ${count} ${count === 1 ? 'item' : 'items'}`}
          </button>
        </>
      }
    >
      <p className="muted small scan-path" title={folderPath}>
        {folderPath}
        {remaining > 0 ? ` — ${remaining} more folder${remaining === 1 ? '' : 's'} waiting after this one` : ''}
      </p>

      {error && <p className="error-text">{error}</p>}
      {!scan && !error && <p className="muted">Looking through the folder…</p>}

      {scan && (
        <>
          <div className="scan-options">
            <label>
              What is in this folder?
              <select value={content} onChange={(e) => {
                  const next = e.target.value as ScanContent
                  setContent(next)
                  setLayout(defaultsFor(next).layout) // each kind of content has its own usual choice
                  setWrap(defaultsFor(next).wrap)
                }}>
                {CONTENT_CHOICES.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </label>
            {content === 'roms' && (
              <label>
                Run these games with
                <select value={emulator} onChange={(e) => setEmulator(e.target.value)}>
                  <option value="">{profiles.length === 0 ? '(add an emulator in Settings first)' : 'Choose an emulator…'}</option>
                  {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {content === 'games' && (
              <label title="Normally each game folder gives one entry: the program that most likely starts the game.">
                <input type="checkbox" checked={allPrograms} onChange={(e) => setAllPrograms(e.target.checked)} /> Show every
                program inside each game folder (not just the best guess)
              </label>
            )}
            {content === 'roms' && (
              <label title="For games that are folders (Wii U, PS3...): every sub-folder becomes one game, named after the folder.">
                <input type="checkbox" checked={gameFolders} onChange={(e) => setGameFolders(e.target.checked)} /> Every
                sub-folder is one game (games kept as folders)
              </label>
            )}
            {!(content === 'roms' && gameFolders) && (
              <label>
                <input type="checkbox" checked={subfolders} onChange={(e) => setSubfolders(e.target.checked)} /> Look inside
                sub-folders
              </label>
            )}
            <label>
              <input type="radio" name="scan-layout" checked={layout === 'tree'} onChange={() => setLayout('tree')} /> Keep
              the folder structure
            </label>
            <label>
              <input type="radio" name="scan-layout" checked={layout === 'flat'} onChange={() => setLayout('flat')} /> One
              plain list
            </label>
            <label className="scan-wrap">
              <input type="checkbox" checked={wrap} onChange={(e) => setWrap(e.target.checked)} /> Put it all in a new
              collection named
              <input
                type="text"
                value={wrapName}
                disabled={!wrap}
                maxLength={200}
                onChange={(e) => setWrapName(e.target.value)}
              />
            </label>
          </div>

          {scan.nodes.length === 0 ? (
            <p className="muted">
              Nothing that can be added was found in this folder
              {scan.ignoredFiles > 0 ? ` (${scan.ignoredFiles} files of other types were ignored)` : ''}.
              {content === 'roms'
                ? 'Looked for console game files (.sfc, .gba, .iso, .chd, .rvz …).'
                : content === 'games'
                ? 'Looked for programs (.exe, .sh, AppImage…), shortcuts and game folders.'
                : content === 'videos'
                  ? 'Looked for video files.'
                  : content === 'comics'
                    ? 'Looked for .cbz/.cbr/PDF files and folders of pictures.'
                    : 'Programs, shortcuts, videos, .cbz/.cbr/PDF files and folders of pictures are recognised.'}
              {' '}Try another choice above if this is not what the folder holds.
            </p>
          ) : (
            <>
              <div className="scan-toolbar">
                <span>
                  Selected {checked.size} of {total}. Adding into “{parentName}”.
                  {searching ? ` Showing ${leavesOf(shown).length} matches.` : ''}
                </span>
                <span className="scan-actions">
                  <button type="button" className="link-btn" onClick={() => setChecked(setLeaves(shown, true, checked))}>
                    {searching ? 'Select shown' : 'Select all'}
                  </button>
                  <button type="button" className="link-btn" onClick={() => setChecked(setLeaves(shown, false, checked))}>
                    {searching ? 'Unselect shown' : 'Select none'}
                  </button>
                  <button type="button" className="link-btn" onClick={() => setExpanded(new Set(collectionIds(scan.nodes)))}>
                    Expand all
                  </button>
                  <button type="button" className="link-btn" onClick={() => setExpanded(new Set())}>
                    Collapse all
                  </button>
                </span>
              </div>
              <div className="scan-search">
                <input
                  type="search"
                  value={search}
                  placeholder="Search this list…"
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape' && search !== '') {
                      e.stopPropagation() // clear the search first; a second Esc closes the dialog
                      setSearch('')
                    }
                  }}
                  aria-label="Search this list"
                />
              </div>
              {searching && rows.length === 0 && <p className="muted">Nothing in this list matches “{search}”.</p>}
              <ul className="scan-list" role="tree">
                {rows.map(({ node, depth }) => {
                  const state = stateOf(node, checked)
                  const isFolder = node.kind === 'collection'
                  const inside = isFolder ? leavesOf(node.children ?? []).length : 0
                  return (
                    <li key={node.id} className="scan-row" style={{ paddingLeft: 8 + depth * 20 }}>
                      {isFolder ? (
                        <button
                          type="button"
                          className="scan-twisty"
                          onClick={() => toggleExpanded(node.id)}
                          aria-label={searching || expanded.has(node.id) ? 'Collapse' : 'Expand'}
                        >
                          {searching || expanded.has(node.id) ? '▾' : '▸'}
                        </button>
                      ) : (
                        <span className="scan-twisty" />
                      )}
                      <TickBox
                        state={state}
                        label={node.name}
                        onChange={() => setChecked(setNode(node, nextOn(state), checked))}
                      />
                      {node.kind === 'launchable' && (
                        <span className="scan-icon">
                          {icons[node.target ?? ''] ? <img src={icons[node.target ?? ''] as string} alt="" /> : null}
                        </span>
                      )}
                      <span className="scan-name" title={node.target ?? node.id}>
                        {node.name}
                      </span>
                      <span className="scan-kind">{isFolder ? `${inside} ${inside === 1 ? 'item' : 'items'}` : KIND_LABEL[node.kind]}</span>
                      {node.duplicate && <span className="scan-note">already in library</span>}
                      {!node.suggested && !node.duplicate && <span className="scan-note">probably not wanted</span>}
                    </li>
                  )
                })}
              </ul>
              {(scan.truncated || scan.unreadable > 0 || scan.ignoredFiles > 0) && (
                <p className="muted small">
                  {scan.truncated ? 'Too many things were found; only the first part is listed. Add it, then add the folder again for the rest. ' : ''}
                  {scan.unreadable > 0 ? `${scan.unreadable} folder(s) could not be opened. ` : ''}
                  {scan.ignoredFiles > 0 ? `${scan.ignoredFiles} files of other types were ignored.` : ''}
                </p>
              )}
            </>
          )}
        </>
      )}
    </Modal>
  )
}
