var assert = require('assert'),
	tinytim = require('../'),
	tim = tinytim.tim;

describe('String inline tests', function () {

	it('inline replace on simple string', function (done) {

		var result = tim("Hello {{place}}", {place: "world"});
		console.log(result);
		assert.equal(result, "Hello world");
		done();
	});

	it('inline path replace on simple string', function (done) {
		var template = "Hello {{place}}. My name is {{person.name}}.",
			data = {
				place: "Brighton",
				person: {
					name: "Prem"
				}
			};

		var result = tim(template, data);
		assert.equal(result, "Hello Brighton. My name is Prem.");

		done();
	});

	it('inline replace on html string', function (done) {
		var template = "<p><a href='{{url}}'>{{title}}</a></p>",
			data = {
				title: "Dharmafly",
				url: "http://dharmafly.com"
			};

		var result = tim(template, data);
		assert.equal(result, "<p><a href='http://dharmafly.com'>Dharmafly</a></p>");

		done();
	});

	it('inline replace on nested object', function (done) {
		var ul = "<ul>{{list}}</ul>",
			li = "<li>{{contents}}</li>",
			myList = "",
			i;

		for (i = 100; i < 103; i++) {
			myList += tim(li, {contents: i});
		}
		var result = tim(ul, {list: myList});
		assert.equal(result, "<ul><li>100</li><li>101</li><li>102</li></ul>");

		done();
	});

	it('inline replace using simple array', function (done) {

		var result = tim("Hello {{0}}", ["world"]);
		assert.equal(result, "Hello world");

		done();
	});

	it('inline replace using object arrays', function (done) {

		var result = tim("Hello {{places.0}}", {places: ["world"]});
		assert.equal(result, "Hello world");

		done();
	});

	it('throws exception if path is invalid', function (done) {

		assert.throws(function () {
			var result = tim("Hello {{config.foo.bar}}", {config: {moo: "blah"}});
		}, Error);

		done();
	});

	it('using non-standard template delimiters endings: `<%` and `%>`', function (done) {
		var tinytim = require('../');

		tinytim.start = "<%";
		tinytim.end = "%>";

		var result = tinytim.tim("Hello <%place%>", {place: "world"});
		assert.equal(result, "Hello world");

		done();
	});

});
