// NCC Example 3 - get return values

var ncc = require('../index.js'); // require('ncc');

var canvas = ncc(function (err, canvas) {
    if (err) throw err;


    var ctx = canvas.getContext("2d");
    ctx.font = "30px Arial";
    var text = "look how exact this fits"

    ctx.measureText(text)(function (err, val) {
        if (err) throw err;

        // --- INFO ---
        //  'val' is whatever the function-call would have returned directly in the browser

        console.log(">>> textWidth: '" + val.width + "'");

        canvas.width = val.width;
        canvas.height = 22;

        ctx.fillStyle = "slateGray";
        ctx.fillRect(0, 0, val.width, 22);

        ctx.font = "30px Arial";
        ctx.fillStyle = "white";
        ctx.fillText(text, 0, 22);

        // --- INFO ---
        //  the callback allways follows the function call:
        //
        //    'canvas.toDataURL()(callback)' not! 'canvas.toDataURL(callback)'

        canvas.toDataURL('image/jpeg', .5)(function (err, val) {
            if (err) throw err;

            console.log(">>> dataURL: '" + val.substring(0, 40) + "...' [length: " + val.length + "]");
        })
    });
})
