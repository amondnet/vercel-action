const { spawn } = require('child_process')

function nowDeploy( context ) {


  const now = spawn('npx', [
    'now',
    '-m',
    'githubCommitAuthorName=Minsu Lee',
    '-m',
    'githubCommitAuthorLogin=amondnet',
    '-m',
    'githubDeployment=1',
    '-m',
    'githubOrg=amondnet',
    '-m',
    'githubRepo=test',
    '-m',
    'githubCommitOrg=amondnet',
    '-m',
    'githubCommitRepo=test',
    '-m',
    'githubCommitSha=48615ece0acfbe87682bbb64d7b87b75db32b60e',
    '-m',
    'githubCommitMessage=test'])

  now.stdout.on('data', (data) => {
    console.log(`stdout': ${data}`)
  })

  now.stderr.on(`data`, (data) => {
    console.error(`stderr: ${data}`)
  })

  now.on('close', (code) => {
    if (code === 0) {
      console.log(`child process exited with code ${code}`)
    }
  })
}


