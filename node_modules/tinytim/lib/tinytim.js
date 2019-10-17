/*!
 tinytim.js
   github.com/premasagar/tim
    A tiny, secure JavaScript micro-templating script.
    by Premasagar Rose
        dharmafly.com
    license
        opensource.org/licenses/mit-license.php
    creates global object
        tim
    v0.3.0
        
	ported and modified by LI Long <lilong@gmail.com> 3/13/2012
 */
var start = exports.start  = "{{";
var end = exports.end	 = "}}";
        
var tim = exports.tim = (function(){
    "use strict";

    var 
        path    = "[a-z0-9_][\\.a-z0-9_]*", // e.g. config.person.name
        undef;
    
    return function(template, data){
        var pattern = new RegExp(exports.start + "\\s*("+ path +")\\s*" + exports.end, "gi");

        // Merge data into the template string
        return template.replace(pattern, function(tag, token){
            var path = token.split("."),
                len = path.length,
                lookup = data,
                i = 0;

            for (; i < len; i++){
                lookup = lookup[path[i]];
                
                // Property not found
                if (lookup === undef){
                    throw new Error("tim: '" + path[i] + "' not found in " + tag);
                }
                
                // Return the required value
                if (i === len - 1){
                    return lookup;
                }
            }
        });
    };
}());
