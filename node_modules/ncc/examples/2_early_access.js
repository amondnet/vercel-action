// NCC Example 2 - early access

var ncc = require('../index.js'); // require('ncc');

// --- INFO ---
// 'ncc' returns the very same canvas two times; in the startup-callback and also directly
// you can use canvas before the startup has finished, all callbacks will be invoked in order when 'ncc' is ready

var canvas = ncc(function (err, canvas) {
    if (err) throw err;

    console.log("... in order of creation!");
})

//  --- ALTERNATIVES ---
//  you can call 'ncc' with no callback at all:
//
//    "var canvas = ncc()"
//
//  ... but keep in mind that you will miss all eventual startup-errors

canvas.width = 400;
canvas.height = 100;

var ctx = canvas.getContext("2d");

ctx.fillStyle = "slateGray";
ctx.font = "30px Arial";
ctx.textAlign = "center";
ctx.fillText("NCC Example 2 - early access", canvas.width / 2, 60, canvas.width-50);

ctx(function (err, res) {
    if (err) throw err;
    
    console.log("all callbacks get invoked ...");
})

