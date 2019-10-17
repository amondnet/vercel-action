// NCC Example 4 - gradients and patterns

var ncc = require('../index.js'); // require('ncc');

var canvas = ncc({ logLevel: 'trace' }, function (err, canvas) {
    if (err) throw err;

    canvas.width = 256;
    canvas.height = 256;

    var ctx = canvas.getContext("2d");

    // --- INFO ---
    //  first we fill the canvas with a gray-white gradient from ul to lr

    var grd = ctx.createLinearGradient(0, 0, 256, 256);
    grd.addColorStop(0, "slateGray");
    grd.addColorStop(1, "white");

    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 256, 256)

    // --- INFO ---
    //  now we reuse the filled canvas in a pattern and draw it back to canvas

    var pat = ctx.createPattern(canvas, "repeat");
    ctx.rect(0, 0, 256, 256);
    ctx.fillStyle = pat;
    ctx.scale(.1, .1)

    ctx.fill()(function (err, res) {
        if (err) throw err;

        console.error("Tataa!");
    });

    //  --- ALTERNATIVES ---
    //  in example 3 you learned return values are accessible through callbacks
    //  this is also true for gradients and patterns:
    //
    //    "ctx.createLinearGradient(0, 0, width, height)(function(err,gra){...)"
    //
    //  but you also have the 'early-access' option allready shown for the initial canvas
    //  in example 2. This is holds for all ncc-proxys-ojects (e.g image, ctx, ...)
})
