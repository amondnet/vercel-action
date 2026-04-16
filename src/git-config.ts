import type { ActionConfig } from './types'
import { execFileSync } from 'node:child_process'
import * as core from '@actions/core'

function runGit(args: string[]): void {
  execFileSync('git', args, { stdio: 'pipe' })
}

export function configureGitAuthor(config: ActionConfig): void {
  if (!config.vercelArgs) {
    return
  }

  const email = config.gitUserEmail
  const name = config.gitUserName

  if (!email && !name) {
    return
  }

  if (!email || !name) {
    core.warning(
      'git-user-email and git-user-name must be set together to rewrite the HEAD commit author. '
      + 'Skipping git author configuration.',
    )
    return
  }

  core.info('configure git author for vercel cli deploy')
  try {
    runGit(['config', 'user.email', email])
    runGit(['config', 'user.name', name])
    runGit(['commit', '--amend', '--no-edit', '--reset-author'])
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to configure git author for Vercel deploy: ${message}`)
  }
}
