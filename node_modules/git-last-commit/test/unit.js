/*jshint expr: true*/

var expect = require('chai').expect;
var process = require('child_process');
var sinon = require('sinon');

var git = require('../source/index.js');

describe('feature: git-last-commit to return last commit info', function() {
  let processExecMethod;

  beforeEach(function() {
    processExecMethod = sinon.stub(process, 'exec');
  });

  afterEach(function() {
    processExecMethod.restore();
  });

  it('should parse git output fully', function(done) {
    processExecMethod.yields(null, '26e689d<##>26e689d8769908329a145201be5081233c711663<##>subject line<##>sanitized subject line<##>this is the body<##>1437984178<##>1437984179<##>Author1<##>author@gmail.com<##>Committer1<##>committer@gmail.com<##>note 1<##>master\nR2\nR1');

    git.getLastCommit(function(err, commit) {
      expect(err).to.be.null;
      expect(commit).to.be.ok;
      expect(commit.shortHash).to.be.equal('26e689d');
      expect(commit.hash).to.be.equal('26e689d8769908329a145201be5081233c711663');
      expect(commit.subject).to.be.equal('subject line');
      expect(commit.sanitizedSubject).to.be.equal('sanitized subject line');
      expect(commit.body).to.be.equal('this is the body');
      expect(commit.authoredOn).to.be.equal('1437984178');
      expect(commit.committedOn).to.be.equal('1437984179');
      expect(commit.author.name).to.be.equal('Author1');
      expect(commit.author.email).to.be.equal('author@gmail.com');
      expect(commit.committer.name).to.be.equal('Committer1');
      expect(commit.committer.email).to.be.equal('committer@gmail.com');
      expect(commit.branch).to.be.equal('master');
      expect(commit.notes).to.be.equal('note 1');
      expect(commit.tags).to.have.members(['R2', 'R1']);

      done();
    });
  });

  it('should parse git output when commit has no notes', function(done) {
    processExecMethod.yields(null, '26e689d<##>26e689d8769908329a145201be5081233c711663<##>subject line<##>sanitized subject line<##>this is the body<##>1437984178<##>1437984179<##>Author1<##>author@gmail.com<##>Committer1<##>committer@gmail.com<##><##>master\nR2\nR1');

    git.getLastCommit(function(err, commit) {
      expect(err).to.be.null;
      expect(commit).to.be.ok;
      expect(commit.shortHash).to.be.equal('26e689d');
      expect(commit.hash).to.be.equal('26e689d8769908329a145201be5081233c711663');
      expect(commit.subject).to.be.equal('subject line');
      expect(commit.sanitizedSubject).to.be.equal('sanitized subject line');
      expect(commit.body).to.be.equal('this is the body');
      expect(commit.authoredOn).to.be.equal('1437984178');
      expect(commit.committedOn).to.be.equal('1437984179');
      expect(commit.author.name).to.be.equal('Author1');
      expect(commit.author.email).to.be.equal('author@gmail.com');
      expect(commit.committer.name).to.be.equal('Committer1');
      expect(commit.committer.email).to.be.equal('committer@gmail.com');
      expect(commit.branch).to.be.equal('master');
      expect(commit.notes).to.be.empty;
      expect(commit.tags).to.have.members(['R2', 'R1']);

      done();
    });
  });

  it('should parse git output when commit has no body', function(done) {
    processExecMethod.yields(null, '26e689d<##>26e689d8769908329a145201be5081233c711663<##>subject line<##>sanitized subject line<##><##>1437984178<##>1437984179<##>Author1<##>author@gmail.com<##>Committer1<##>committer@gmail.com<##>note 1<##>master\nR2\nR1');

    git.getLastCommit(function(err, commit) {
      expect(err).to.be.null;
      expect(commit).to.be.ok;
      expect(commit.shortHash).to.be.equal('26e689d');
      expect(commit.hash).to.be.equal('26e689d8769908329a145201be5081233c711663');
      expect(commit.subject).to.be.equal('subject line');
      expect(commit.sanitizedSubject).to.be.equal('sanitized subject line');
      expect(commit.body).to.be.empty;
      expect(commit.authoredOn).to.be.equal('1437984178');
      expect(commit.committedOn).to.be.equal('1437984179');
      expect(commit.author.name).to.be.equal('Author1');
      expect(commit.author.email).to.be.equal('author@gmail.com');
      expect(commit.committer.name).to.be.equal('Committer1');
      expect(commit.committer.email).to.be.equal('committer@gmail.com');
      expect(commit.branch).to.be.equal('master');
      expect(commit.notes).to.be.equal('note 1');
      expect(commit.tags).to.have.members(['R2', 'R1']);

      done();
    });
  });

  it('should parse git output when commit has no tags', function(done) {
    processExecMethod.yields(null, '26e689d<##>26e689d8769908329a145201be5081233c711663<##>subject line<##>sanitized subject line<##>this is the body<##>1437984178<##>1437984179<##>Author1<##>author@gmail.com<##>Committer1<##>committer@gmail.com<##>note 1<##>master\n');

    git.getLastCommit(function(err, commit) {
      expect(err).to.be.null;
      expect(commit).to.be.ok;
      expect(commit.shortHash).to.be.equal('26e689d');
      expect(commit.hash).to.be.equal('26e689d8769908329a145201be5081233c711663');
      expect(commit.subject).to.be.equal('subject line');
      expect(commit.sanitizedSubject).to.be.equal('sanitized subject line');
      expect(commit.body).to.be.equal('this is the body');
      expect(commit.authoredOn).to.be.equal('1437984178');
      expect(commit.committedOn).to.be.equal('1437984179');
      expect(commit.author.name).to.be.equal('Author1');
      expect(commit.author.email).to.be.equal('author@gmail.com');
      expect(commit.committer.name).to.be.equal('Committer1');
      expect(commit.committer.email).to.be.equal('committer@gmail.com');
      expect(commit.branch).to.be.equal('master');
      expect(commit.notes).to.be.equal('note 1');
      expect(commit.tags).to.be.empty;

      done();
    });
  });

  it('should parse git output when commit body has newline', function(done) {
    processExecMethod.yields(null, '26e689d<##>26e689d8769908329a145201be5081233c711663<##>subject<##>sanitized subject<##>this is\nthe body<##>1437984178<##>1437984179<##>Author1<##>author@gmail.com<##>Committer1<##>committer@gmail.com<##>note 1<##>master\n');

    git.getLastCommit(function(err, commit) {
      expect(err).to.be.null;
      expect(commit).to.be.ok;
      expect(commit.shortHash).to.be.equal('26e689d');
      expect(commit.hash).to.be.equal('26e689d8769908329a145201be5081233c711663');
      expect(commit.subject).to.be.equal('subject');
      expect(commit.sanitizedSubject).to.be.equal('sanitized subject');
      expect(commit.body).to.be.equal('this is\nthe body');
      expect(commit.authoredOn).to.be.equal('1437984178');
      expect(commit.committedOn).to.be.equal('1437984179');
      expect(commit.author.name).to.be.equal('Author1');
      expect(commit.author.email).to.be.equal('author@gmail.com');
      expect(commit.committer.name).to.be.equal('Committer1');
      expect(commit.committer.email).to.be.equal('committer@gmail.com');
      expect(commit.branch).to.be.equal('master');
      expect(commit.notes).to.be.equal('note 1');
      expect(commit.tags).to.be.empty;

      done();
    });
  });

  it('should parse git output when commit body has comma', function(done) {
    processExecMethod.yields(null, '26e689d<##>26e689d8769908329a145201be5081233c711663<##>subject<##>sanitized subject<##>this is, the body<##>1437984178<##>1437984179<##>Author1<##>author@gmail.com<##>Committer1<##>committer@gmail.com<##>note 1<##>master\n');

    git.getLastCommit(function(err, commit) {
      expect(err).to.be.null;
      expect(commit).to.be.ok;
      expect(commit.shortHash).to.be.equal('26e689d');
      expect(commit.hash).to.be.equal('26e689d8769908329a145201be5081233c711663');
      expect(commit.subject).to.be.equal('subject');
      expect(commit.sanitizedSubject).to.be.equal('sanitized subject');
      expect(commit.body).to.be.equal('this is, the body');
      expect(commit.authoredOn).to.be.equal('1437984178');
      expect(commit.committedOn).to.be.equal('1437984179');
      expect(commit.author.name).to.be.equal('Author1');
      expect(commit.author.email).to.be.equal('author@gmail.com');
      expect(commit.committer.name).to.be.equal('Committer1');
      expect(commit.committer.email).to.be.equal('committer@gmail.com');
      expect(commit.branch).to.be.equal('master');
      expect(commit.notes).to.be.equal('note 1');
      expect(commit.tags).to.be.empty;

      done();
    });
  });

  it('should parse git output fully when commit has single tag', function(done) {
    processExecMethod.yields(null, '26e689d<##>26e689d8769908329a145201be5081233c711663<##>subject line<##>sanitized subject line<##>this is the body<##>1437984178<##>1437984179<##>Author1<##>author@gmail.com<##>Committer1<##>committer@gmail.com<##>note 1<##>master\nR1');

    git.getLastCommit(function(err, commit) {
      expect(err).to.be.null;
      expect(commit).to.be.ok;
      expect(commit.shortHash).to.be.equal('26e689d');
      expect(commit.hash).to.be.equal('26e689d8769908329a145201be5081233c711663');
      expect(commit.subject).to.be.equal('subject line');
      expect(commit.sanitizedSubject).to.be.equal('sanitized subject line');
      expect(commit.body).to.be.equal('this is the body');
      expect(commit.authoredOn).to.be.equal('1437984178');
      expect(commit.committedOn).to.be.equal('1437984179');
      expect(commit.author.name).to.be.equal('Author1');
      expect(commit.author.email).to.be.equal('author@gmail.com');
      expect(commit.committer.name).to.be.equal('Committer1');
      expect(commit.committer.email).to.be.equal('committer@gmail.com');
      expect(commit.branch).to.be.equal('master');
      expect(commit.notes).to.be.equal('note 1');
      expect(commit.tags).to.have.members(['R1']);

      done();
    });
  });

  it('should parse git output fully when commit has multiple tags', function(done) {
    processExecMethod.yields(null, '26e689d<##>26e689d8769908329a145201be5081233c711663<##>subject line<##>sanitized subject line<##>this is the body<##>1437984178<##>1437984179<##>Author1<##>author@gmail.com<##>Committer1<##>committer@gmail.com<##>note 1<##>master\nR1\nR2');

    git.getLastCommit(function(err, commit) {
      expect(err).to.be.null;
      expect(commit).to.be.ok;
      expect(commit.shortHash).to.be.equal('26e689d');
      expect(commit.hash).to.be.equal('26e689d8769908329a145201be5081233c711663');
      expect(commit.subject).to.be.equal('subject line');
      expect(commit.sanitizedSubject).to.be.equal('sanitized subject line');
      expect(commit.body).to.be.equal('this is the body');
      expect(commit.authoredOn).to.be.equal('1437984178');
      expect(commit.committedOn).to.be.equal('1437984179');
      expect(commit.author.name).to.be.equal('Author1');
      expect(commit.author.email).to.be.equal('author@gmail.com');
      expect(commit.committer.name).to.be.equal('Committer1');
      expect(commit.committer.email).to.be.equal('committer@gmail.com');
      expect(commit.branch).to.be.equal('master');
      expect(commit.notes).to.be.equal('note 1');
      expect(commit.tags).to.have.members(['R1', 'R2']);

      done();
    });
  });

  it('should run the git command on given destination', function(done) {
    processExecMethod.yields(null, '26e689d<##>26e689d8769908329a145201be5081233c711663<##>subject line<##>sanitized subject line<##>this is the body<##>1437984178<##>1437984179<##>Author1<##>author@gmail.com<##>Committer1<##>committer@gmail.com<##>note 1<##>master\nR2\nR1');

    git.getLastCommit(function(err, commit) {
      expect(err).to.be.null;
      expect(commit).to.be.ok;
      expect(processExecMethod.args[0][1].cwd).to.be.ok;
      expect(processExecMethod.args[0][1].cwd).to.be.equal('path/path/whatever');

      done();
    }, {dst: 'path/path/whatever'});
  });

  it('should handle error properly if this is not a git repo', function(done) {
    processExecMethod.yields(null, '');

    git.getLastCommit(function(err, commit) {
      expect(err).to.be.not.null;
      expect(commit).to.be.undefined;
      expect(err).to.be.equal('this does not look like a git repo');

      done();
    });
  });

  it('should handle stderr coming from git output', function(done) {
    processExecMethod.yields(null, null, 'command not found git');

    git.getLastCommit(function(err, commit) {
      expect(err).to.be.not.null;
      expect(commit).to.be.undefined;
      expect(err).to.be.equal('command not found git');

      done();
    });
  });
});
