const process = require('child_process'),
  splitCharacter = '<##>'

const executeCommand = (command, options, callback) => {
  let dst = __dirname

  if(!!options && options.dst) {
    dst = options.dst
  }

  process.exec(command, {cwd: dst}, function(err, stdout, stderr) {
    if (stdout === '') {
      callback('this does not look like a git repo')
      return
    }

    if (stderr) {
      callback(stderr)
      return
    }

    callback(null, stdout)
  })
}

const prettyFormat = ["%h", "%H", "%s", "%f", "%b", "%at", "%ct", "%an", "%ae", "%cn", "%ce", "%N", ""]

const getCommandString = splitCharacter =>
  'git log -1 --pretty=format:"' + prettyFormat.join(splitCharacter) +'"' +
    ' && git rev-parse --abbrev-ref HEAD' +
    ' && git tag --contains HEAD'

const getLastCommit = (callback, options) => {
  const command = getCommandString(splitCharacter)

  executeCommand(command, options, function(err, res) {
    if (err) {
      callback(err)
      return
    }

    var a = res.split(splitCharacter)

    // e.g. master\n or master\nv1.1\n or master\nv1.1\nv1.2\n
    var branchAndTags = a[a.length-1].split('\n').filter(n => n)
    var branch = branchAndTags[0]
    var tags = branchAndTags.slice(1)

    callback(null, {
      shortHash: a[0],
      hash: a[1],
      subject: a[2],
      sanitizedSubject: a[3],
      body: a[4],
      authoredOn: a[5],
      committedOn: a[6],
      author: {
        name: a[7],
        email: a[8],
      },
      committer: {
        name: a[9],
        email: a[10]
      },
      notes: a[11],
      branch,
      tags
    })
  })
}

module.exports = {
  getLastCommit
}
