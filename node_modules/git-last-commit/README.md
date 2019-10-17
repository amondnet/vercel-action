# git-last-commit
Node.js module to read last git commit information including tags and branch - mostly to be used by continuous integration and build systems for build tagging purposes.

## Usage
```javascript
var git = require('git-last-commit');

git.getLastCommit(function(err, commit) {
  // read commit object properties
  console.log(commit);
});
```

Function returns an object like this:
```javascript
{
  "shortHash": "d2346fa",
  "hash": "d2346faac31de5e954ef5f6baf31babcd3e899f2",
  "subject": "initial commit",
  "sanitizedSubject": "initial-commit",
  "body": "this is the body of the commit message",
  "authoredOn": "1437988060",
  "committedOn": "1437988060",
  "author": {
    "name": "Ozan Seymen",
    "email": "oseymen@gmail.com"
  },
  "committer": {
    "name": "Ozan Seymen",
    "email": "oseymen@gmail.com"
  },
  "notes": "commit notes",
  "branch": "master",
  "tags": ['R1', 'R2']
}
```

You can add path destination if you want to get git last commit information on another repository:
```javascript
var git = require('git-last-commit');

git.getLastCommit(function(err, commit) {
  // read commit object properties
  console.log(commit);
}, {dst: 'some/other/path'});
```
