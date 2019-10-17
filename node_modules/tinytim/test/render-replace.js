var assert = require('assert'),
	tinytim = require('../'),
	tim = tinytim.tim;

describe('Render inline tests', function () {

	it('inline replace on simple string', function (done) {
		var result = tinytim.render("Hello {{place}}", {place: "world"});
		assert.equal(result, "Hello world");
		done();
	});

	it('Render inline path replace on simple string', function (done) {
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

	it('Render inline replace on html string', function (done) {
		var template = "<p><a href='{{url}}'>{{title}}</a></p>",
			data = {
				title: "Dharmafly",
				url: "http://dharmafly.com"
			};

		var result = tinytim.render(template, data);
		assert.equal(result, "<p><a href='http://dharmafly.com'>Dharmafly</a></p>");
		done();
	});

	it('Render inline replace on nested object', function (done) {
		var ul = "<ul>{{list}}</ul>",
			li = "<li>{{contents}}</li>",
			myList = "",
			i;

		for (i = 100; i < 103; i++) {
			myList += tinytim.render(li, {contents: i});
		}
		var result = tinytim.render(ul, {list: myList});
		assert.equal(result, "<ul><li>100</li><li>101</li><li>102</li></ul>");

		done();
	});

	it('Render inline replace using simple array', function (done) {

		var result = tinytim.render("Hello {{0}}", ["world"]);
		assert.equal(result, "Hello world");

		done();
	});

	it('Render inline replace using object arrays', function (done) {

		var result = tinytim.render("Hello {{places.0}}", {places: ["world"]});
		assert.equal(result, "Hello world");

		done();
	});

	it('Render throws exception if path is invalid', function (done) {

		assert.throws(function () {
			var result = tinytim.render("Hello {{config.foo.bar}}", {config: {moo: "blah"}});
		}, Error);

		done();
	});

	it('Render using non-standard template delimiters endings: `<%` and `%>`', function (done) {
		var tinytim = require('../');

		tinytim.start = "<%";
		tinytim.end = "%>";

		var result = tinytim.render("Hello <%place%>", {place: "world"});
		assert.equal(result, "Hello world");

		tinytim.start = "{{";
		tinytim.end = "}}";

		done();
	});

});
