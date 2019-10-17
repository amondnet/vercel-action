#tinytim for node.js  [![Build Status](https://secure.travis-ci.org/baryon/node-tinytim.png)](http://travis-ci.org/baryon/node-tinytim)

Node.js port of [tinytim](https://github.com/premasagar/tim/) (A tiny, secure JavaScript micro-templating script)


##Install
-----
```javascript
npm install tinytim
```

Usage
-----
Add to your code:

```javascript
	var tim = require('tinytim').tim;
	var result = tim("Hello {{place}}", {place: "world"});
	console.log(result); // Hello world
```

See [test/tim-replace.js](https://github.com/baryon/node-tinytim/blob/master/test/tim-replace.js) as example

and support render and renderFile methods.  
See [test/render-replace.js](https://github.com/baryon/node-tinytim/blob/master/test/render-replace.js) and [test/render-file-replace.js](https://github.com/baryon/node-tinytim/blob/master/test/render-file-replace.js)  for details.

```javascript
	var tinytim = require('tinytim');
	var result = tinytim.render("Hello {{place}}", {place: "world"});
	console.log(result); // Hello world
```

```javascript
	var tinytim = require('tinytim');
	var result1 = tinytim.renderFile("./hello.tim", {place: "world"}); 
	console.log(result1); // Hello world

	var result2 = tinytim.renderFile("./hello.tim", {place: "world"}, true); //use cache to render 
	console.log(result2); // Hello world
```


# Tim

A tiny, secure JavaScript micro-templating script.

Tim lets you write simple templates that uses JavaScript's familiar dot notation. You pass in a JavaScript object that contains all the relevant strings, and they are then substituted into the template. For example:

    tim("Hello {{place}}", {place: "world"});
    // "Hello world"

* by [Premasagar Rose](http://premasagar.com) 
    ([Dharmafly](http://dharmafly.com))
* source: [github.com/premasagar/tim](http://github.com/premasagar/tim) ([MIT license](http://opensource.org/licenses/mit-license.php))
* ~200 bytes minified & gzipped


## Why is micro-templating useful?
Don't you just hate having to write HTML with a mess of string concatenation that clutters up your JavaScript?:

    var myHTML = "<ul class='" + myClass + "'>" +
        "<li id='" + theId + "'>" + liContents + "</li>" +
        // etc, etc, etc
        
Yuck. There's no need to do this. Simply prepare a JavaScript object with the required properties, and inject it into a simple template string. The templates can all be tidily kept together with the rest of the markup in an HTML document (see below).


## How is Tim different from other templating scripts?
It is safe and secure: it doesn't use eval or (new Function), so it cannot execute malicious code. As such, it can be used in secure widgets and apps that disallow eval - e.g. Adobe Air sandboxes, AdSafe ads, etc.

It doesn't include a whole bloat load of features that are unlikely to get used when you just want to get some simple templating up and running.

It comes in two versions: "tinytim.js" (<200kb), and "standard", which has advanced functionality and allows extensibility with plugins.

It's easy to debug.

For these reasons, it is now in use in Sqwidget, the JavaScript widget library: [github.com/premasagar/sqwidget](http://github.com/premasagar/sqwidget)


## Tim & tinytim.js: Core Functionality
There are two versions of Tim: the "standard" (full) version, and a stripped down "tinytim.js" version.  The core functionality of both versions is identical, and is described below.  


Tim can be used to replace tokens within a text string with specified data.

For example: 

    var template = "Hello {{place}}. My name is {{person.name}}.",
        data = {
            place: "Brighton",
            person: {
                name: "Prem"
            }
        };
        
    tim(template, data);
    // "Hello Brighton. My name is Prem."


In addition to plain and simple text, you can use Tim to populate HTML or other types of template.

For example:

    var template = "<p><a href='{{url}}'>{{title}}</a></p>",
        data = {
            title: "Dharmafly",
            url:   "http://dharmafly.com"
        };
        
    tim(myTemplate, data);
    // "<p><a href='http://dharmafly.com'>Dharmafly</a></p>"
    
...and so on, all the way up to a full-blown HTML document.


### Nested templates
Sometimes, you will want to reuse the same template multiple times in a loop, and then wrapped within a bigger template - e.g. when creating an HTML `<ul>` list tag.

This is easily achieved:

    var ul = "<ul>{{list}}</ul>",
        li = "<li>{{contents}}</li>",
        myList = "",
        i;
        
    for (i=100; i<103; i++){
        myList += tim(li, {contents: i});
    }
    tim(ul, {list: myList});
    // "<ul><li>100</li><li>101</li><li>102</li></ul>"
        

### Debugging
If your template references a path in the data object that could not actually be found, then Tim will throw an error, to help with debugging:

    tim("Hello {{config.foo.bar}}", {config: {moo: "blah"}});
    // tim: 'foo' not found in {{config.foo.bar}}


### Using arrays
The data can be, or can include, an array. Use dot notation to access the array elements.

e.g:

    tim("Hello {{0}}", ["world"]);
    // "Hello world"
    
or:

    tim("Hello {{places.0}}", {places: ["world"]});
    // "Hello world"
    
Further examples are discussed in the section "iterating through arrays" below.


### Changing the {{curly braces}} delimiter
By default, template tags are delimited by "`{{`" and "`}}`" tokens.
To change this, edit the `start` and `end` vars in the code.
*** this will affect all module use tinytim, because node.js cache this package.

```javascript
	var tinytim = require('tinytim');
	tinytim.start = "<%";
	tinytim.end = "%>";
	var result = tinytim.tim("Hello <%place%>", {place: "world"});
	console.log(result); // Hello world
```

# mustache.js and Handlebars.js
tinytim is very simple, if you need a more powerful template library, see [mustache.js](http://mustache.github.com/) and [Handlebars.js](https://github.com/wycats/handlebars.js/)


## History

### 0.1.0

* support render and renderFile methods.  

### 0.0.2

* throw an new Error when not found.  

### 0.0.1

* Initial port.  

## License 

(The MIT License)

Copyright (c) Premasagar Rose  &lt;p@dharmafly.com&gt;

Copyright (c) 2012 LI Long  &lt;lilong@gmail.com&gt;

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
'Software'), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.