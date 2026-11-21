// Errors from the backend arrive as
// "Error invoking remote method 'x': Error: message". Show only the message.
export function readableError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return text.replace(/^Error invoking remote method '[^']*': (Error: )?/, '')
}
