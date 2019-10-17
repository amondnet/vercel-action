/*jshint expr: true*/

var expect = require('chai').expect;

var git = require('../source/index.js');

describe('feature: git-last-commit to return last commit info', function() {
	it('should parse git commands fully when command is really executed', function(done) {
		git.getLastCommit(function(err, commit) {
			expect(err).to.be.null;
			expect(commit).to.be.ok;
			expect(commit.shortHash).to.have.length(7);
			expect(commit.hash).to.have.length(40);
			expect(commit.subject).to.match(/.+/);
			expect(commit.sanitizedSubject).to.match(/.+/);
			expect(commit.body).to.match(/.*/);
			expect(commit.authoredOn).to.match(/\d{10}/);
			expect(commit.committedOn).to.match(/\d{10}/);
			expect(commit.author.name).to.match(/.+/);
			expect(commit.author.email).to.match(/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,4}$/);
			expect(commit.committer.name).to.match(/.+/);
			expect(commit.committer.email).to.match(/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,4}$/);
			expect(commit.branch).to.match(/.*/);
			expect(commit.tags).to.be.instanceOf(Array);

			done();
		});
	});
});
