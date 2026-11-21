// Duplicate checks compare locations. Windows ignores upper/lower case in paths
// (Game.exe = game.exe); Linux does not (they are two different files).
export function pathKey(path: string, platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? path.toLowerCase() : path
}
