var assert = require('assert'),
	tinytim = require('../'),
	tim = tinytim.tim;

describe('Render File tests', function () {

	it('file replace on simple string', function (done) {
		var result = tinytim.renderFile("test/files/string.tim", {place: "world"});
		assert.equal(result, "Hello world");
		done();
	});

	it('file path replace on simple string', function (done) {
		var template = "test/files/string2.tim",
			data = {
				place: "Brighton",
				person: {
					name: "Prem"
				}
			};

		var result = tinytim.renderFile(template, data);
		assert.equal(result, "Hello Brighton. My name is Prem.");
		done();
	});

	it('file replace on html string', function (done) {
		var template = "test/files/html.tim",
			data = {
				title: "Dharmafly",
				url: "http://dharmafly.com"
			};

		var result = tinytim.renderFile(template, data);
		assert.equal(result, "<p><a href='http://dharmafly.com'>Dharmafly</a></p>");
		done();
	});

});
