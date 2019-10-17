// NCC Example 5 - images

var ncc = require('../index.js'); // require('ncc');
var canvas = ncc(function (err, canvas) {
    if (err) throw err;

    var img = ncc.createImage();

    img.onerror = function (err) {
        console.error("img Error:", err);
    }

    img.onload = function (img) {

        // --- INFO ---
        //  after loaded the img has 'width' and 'height' attributes

        canvas.width = img.width+20;
        canvas.height = img.height+20;

        var ctx = canvas.getContext("2d");
        ctx.drawImage(img, 10, 10)(function (err,res) {
            if (err) throw err;

            console.log("Hi! My name is Stefan, but you can call me 'indus'!");
        });
    }

    // --- INFO ---
    //  setting 'src' triggers image loading:
    //
    //    from the filesystem:  'img.src = "path/to/image.png"'
    //    from a URL:           'img.src = "http://www.yourSite.com/image.png"' ('https://...' and 'ftp://..' is not supported)
    //    from a dataURL:       'img.src = "data:image/png;base64, ..."'

    img.src = __dirname + "/dummy.jpg"


    //  --- ALTERNATIVES ---
    //  'createImage' allows to pass all necessary arguments directly:
    //
    //    'ncc.createImage(<srcString>,<onloadFn>,<onerrorFn>)'


    // --- INFO ---
    //  an image-proxy-object has a hidden property to access its data as 'base64' encoded dataURL
    //
    //    'var dataURL = img._base64'
    //
    //  and it also has a hidden function to write it directly to the filesystem
    //
    //    'img._toFile('path/to/newImg.png',<callback>)'

})
