import { readFileSync } from 'node:fs'
import path from 'node:path'

function resolveWorkingDir(workingDirectory: string): string {
  return workingDirectory || process.cwd()
}

export function readNodeVersion(workingDirectory: string): string | undefined {
  const filePath = path.join(resolveWorkingDir(workingDirectory), 'package.json')

  let raw: string
  try {
    raw = readFileSync(filePath, 'utf8')
  }
  catch {
    return undefined
  }

  try {
    const parsed = JSON.parse(raw) as { engines?: { node?: unknown } }
    const node = parsed.engines?.node
    return typeof node === 'string' ? node : undefined
  }
  catch {
    return undefined
  }
}

export function readVercelJson(workingDirectory: string): Record<string, unknown> | null {
  const filePath = path.join(resolveWorkingDir(workingDirectory), 'vercel.json')

  let raw: string
  try {
    raw = readFileSync(filePath, 'utf8')
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    throw error
  }

  try {
    return JSON.parse(raw) as Record<string, unknown>
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to parse ${filePath}: ${message}`)
  }
}
