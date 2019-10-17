module.exports = require('./tinytim');

/**
 * Intermediate js cache.
 * 
 * @type Object
 */

var cache = {};

/**
 * Clear intermediate js cache.
 * 
 * @api public
 */

module.exports.clearCache = function() {
	cache = {};
};

/**
 * Render the given `str` of tim.
 * 
 * @param {String}
 *            str
 * @param {Object}
 *            vars
 * @return {String}
 * @api public
 */

module.exports.render = module.exports.tim;


/**
 * Render an tim file at the given `path`.
 * 
 * @param {String}
 *            path
 * @param {Vars}
 *            vars
 * @param {Bool}
 *            use cache or not
 * @api public
 */

module.exports.renderFile = function(path, vars, useCache) {
	var fs = require('fs');
	var key = path + ':string';
	var str = useCache ? cache[key]
			|| (cache[key] = fs.readFileSync(path, 'utf8')) : fs
			.readFileSync(path, 'utf8');

	return module.exports.render(str, vars);
};
