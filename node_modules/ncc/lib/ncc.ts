/// <reference path="chrome-launcher.ts" />

var http = require('http')
    , fs = require('fs')
    , ws = require('ws')
    , path = require('path');

var DEBUG = false;

var logger;

interface NCC {
    (options?, callback?): Canvas;
    options: any;
    createCanvas(width?: number, height?: number): Canvas;
    createImage(src?: string, onload?: Function, onerror?: Function): Image;
    uid(type?: string): string;
    log(msg: string, level?: number): void;
}

var NCC = Object.defineProperties(
    (options_, callback_) => {
        if (typeof (options_) == 'function') {
            callback_ = options_;
            options_ = null;
        }

        var callback = callback_;

        if (options_)
            for (var key in NCC.options)
                if (options_[key] !== undefined)
                    NCC.options[key] = options_[key];


        logger = require('tracer').colorConsole({
            format: "[ncc] {{message}}",
            level: NCC.options.logLevel
        });

        var canvas = NCC.createCanvas(undefined, undefined, true);

        var attempts = 0;
        function connect() {
            var url = `http://localhost:${NCC.options.port}/json`;

            http.get(url, res => {
                var rdJson = '';

                res.on('data', chunk => rdJson += chunk);

                res.on('end', () => {
                    var ncc_ = JSON.parse(rdJson).find(i => i.title === "ncc" || path.basename(i.url) === "ncc.html");

                    if (!ncc_) {
                        if (attempts < NCC.options.retry) {
                            attempts++;
                            logger.info(`connecting [retry ${attempts}/${NCC.options.retry}]`);
                            setTimeout(connect, NCC.options.retryDelay);
                        } else logger.error('connection failed');
                        return;
                    }

                    Object.defineProperties(rdp, { ws: { value: new ws(ncc_.webSocketDebuggerUrl) } });

                    rdp.ws.on('open', () => {
                        logger.info("connected");

                        function checkReadyState() {
                            rdp.ws.once('message', (data) => {
                                data = JSON.parse(data);
                                if (!(data.result && data.result.result.value == "complete"))
                                    return checkReadyState();

                                logger.info(`document.readyState is "complete"`);
                                rdp((err, res) => {

                                    if (err)
                                        logger.error(`[ncc] error: ${err.message}`);
                                    if (callback)
                                        err ? callback(err, null) : callback(null, canvas, rdp);
                                })
                            })
                            rdp.ws.send(`{"id":0,"method":"Runtime.evaluate", "params":{"expression":"document.readyState"}}`, err => err && checkReadyState());
                        }
                        checkReadyState()


                    });

                    rdp.ws.on('close', () => logger.info("session closed"));


                })
            })
        }

        var index = path.join(__dirname, 'ncc.html');
        var launcher = new ChromeLauncher({
            port: NCC.options.port,
            autoSelectChrome: true,
            startingUrl: NCC.options.headless ? index : '',
            chromeFlags: NCC.options.headless ?
                ['--window-size=0,0', '--disable-gpu', '--headless'] :
                [`--app=${index}`]
        })

        const exitHandler = (err) => {
            rdp.ws.terminate()
            launcher.kill().then(() => process.exit(-1));
        };

        process.on('SIGINT', exitHandler);
        process.on('unhandledRejection', exitHandler);
        process.on('rejectionHandled', exitHandler);
        process.on('uncaughtException', exitHandler);

        launcher.run()
            .then((a) => {
                logger.info("chrome started");
                connect()
            })
            .catch(err => {
                return launcher.kill().then(() => {
                    logger.error("failed starting chrome");
                    throw err;
                }, logger.error);
            });

        return canvas;

    }, {
        options: {
            enumerable: true,
            writable: true,
            value: {
                logLevel: 'info',
                port: 9222,
                retry: 9,
                retryDelay: 500,
                headless: false
            }
        },
        createCanvas: {
            enumerable: true,
            value: function (width?: number, height?: number, main?: boolean) {

                if (!main) {
                    var uid = NCC.uid('canvas')
                    rdp(`var ${uid} = document.createElement('canvas')`);
                }

                var canvas: any = (callback?) => {
                    rdp(callback ? (err, res) => {
                        err ? callback(err, null) : callback(null, canvas);
                    } : undefined);
                    return canvas;
                }

                CanvasPDM._uid.value = main ? 'canvas' : uid;
                Object.defineProperties(canvas, CanvasPDM);
                CanvasPDM._uid.value = '';

                canvas.width = width;
                canvas.height = height;

                return canvas;
            }
        },
        createImage: {
            enumerable: true,
            value: function (src?: string, onload?: Function, onerror?: Function) {
                var uid = NCC.uid('image')
                rdp(`var ${uid} = new Image()`);
                var image: any = (callback?) => {
                    rdp(callback ? (err, res) => {
                        err ? callback(err, null) : callback(null, image);
                    } : undefined);
                    return image;
                }

                ImagePDM._uid.value = uid;
                Object.defineProperties(image, ImagePDM);
                ImagePDM._uid.value = '';

                image.src = src;
                image.onload = onload;
                image.onerror = onerror;

                return image

            }
        },
        uid: {
            enumerable: false,
            value: type => `${type}_${Math.random().toString(36).slice(2)}`
        }
    })




interface RDP {
    (_?: any): RDP;
    cmd: string;
    queue: any[];
    ws: any;
}

// RDP | Remote Debugging Protocol (the bridge to chrome)
var rdp = Object.defineProperties(
    (_): RDP => {

        if (typeof _ == 'string') {
            logger.log(`< ${_}`);
            rdp.cmd += `${_};`;
            return rdp;
        }

        if (_ !== null) {
            if (rdp.cmd === '') {
                _();
                return rdp;
            }
            rdp.queue.push({
                cmd: rdp.cmd,
                callback: _
            });
            rdp.cmd = '';
        }

        if (!rdp.queue[0] || rdp.req == rdp.queue[0] || !rdp.ws) return rdp;

        rdp.req = rdp.queue[0];

        logger.trace(`> ${rdp.req.cmd.split(';').join(';\n  ')}`);

        rdp.ws.once('message', data => {
            data.error && logger.error(data.error)
            !data.error && logger.log(data.result);

            data = JSON.parse(data);

            var err = data.error || data.result.wasThrown ? data.result.result.description : null,
                res = err ? null : data.result.result;

            if (rdp.req.callback) rdp.req.callback(err, res);
            rdp.req = rdp.queue.shift();
            rdp(null);
        });

        rdp.ws.send(`{"id":0,"method":"Runtime.evaluate", "params":{"expression":"${rdp.req.cmd}"}}`, err => err && rdp());

        return rdp;
    }, {
        cmd: { enumerable: DEBUG, writable: true, value: '' },
        queue: { enumerable: DEBUG, value: [] }
    })

// Callback || abstract interface
interface Callback {
    (callback?: Function): Callback;
}

// ProxyObj || abstract interface
interface ProxyObj extends Callback {
    _uid: string;
    _remote: any;
}

// Canvas
interface Canvas extends ProxyObj {
    (callback?): Canvas;
    _ctx: Context2d;
    width: number;
    height: number;
    getContext: (contextId: string) => Context2d;
}

var CanvasPDM = {

    // private properties
    _uid: {
        configurable: true,
        enumerable: DEBUG,
        value: "canvas"
    },
    _remote: {
        enumerable: DEBUG,
        set: function (null_) {
            if (null_ === null) {
                if (this._uid == 'canvas')
                    return logger.error('you cannot delete the main canvas')
                rdp(`${this._uid} = null`);
                Object.defineProperty(this, '_uid', { value: null });
                this._ctx = null;
            } else return logger.error('"_remote" can only be set to "null"')
        }
    },

    _ctx: {
        enumerable: DEBUG,
        writable: true,
        value: null
    },

    // Properties || proxies with defaults
    width_: {
        enumerable: DEBUG,
        writable: true,
        value: 300
    },
    height_: {
        enumerable: DEBUG,
        writable: true,
        value: 150
    },

    // Web API: https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement

    // Properties || getters/setters || https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement#Properties
    width: {
        enumerable: true,
        get: function () {
            return this.width_;
        },
        set: function (width) {
            if (width === undefined) return;
            rdp(`${this._uid}.width = ${width}`)
            return this.width_ = width;
        }
    },
    height: {
        enumerable: true,
        get: function () {
            return this.height_;
        },
        set: function (height) {
            if (height === undefined) return;
            rdp(`${this._uid}.height = ${height}`)
            return this.height_ = height;
        }
    },

    // Methods || https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement#Methods
    getContext: {
        enumerable: true,
        value: function (contextId: string) {
            if (contextId == '2d') {

                var uid = this._uid == 'canvas' ? 'context2d' : NCC.uid('context2d')
                rdp(`var ${uid} = ${this._uid}.getContext('2d')`);

                var context2d: any = (callback?) => {
                    rdp(callback ? (err, res) => {
                        err ? callback(err, null) : callback(null, context2d);
                    } : undefined);
                    return context2d;
                }

                context2dPDM._uid.value = uid;
                context2dPDM['canvas'].value = this;
                Object.defineProperties(context2d, context2dPDM);
                context2dPDM._uid.value = '';

                return context2d;
            } else
                logger.error(`${contextId} is not implemented`);
        }
    },
    toDataURL: {
        enumerable: true,
        value: function (type, args) {

            rdp(`${this._uid}.toDataURL(${`'${type}'` || ''})`);


            return (callback) => {
                rdp((err, res) => {
                    if (err)
                        return callback(err, null);
                    callback(err, res.value);
                });
            };
        }
    }
};


// context2d
interface Context2d extends ProxyObj {
    (callback?): Context2d;
    canvas: Canvas;
    fillStyle: any;
    font: string;
    globalAlpha: number;
    globalCompositeOperation: string;
    lineCap: string;
    lineJoin: string;
    lineWidth: number;
    miterLimit: number;
    shadowBlur: number;
    shadowColor: string;
    shadowOffsetX: number;
    shadowOffsetY: number;
    strokeStyle: any;
    textAlign: string;
    textBaseline: string;
    webkitBackingStorePixelRatio: number;
    webkitImageSmoothingEnabled: boolean;
    arc(x: number, y: number, radius: number, startAngle?: number, endAngle?: number, anticlockwise?: boolean): Context2d;
    arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): Context2d;
    beginPath(): Context2d;
    bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): Context2d;
    clearRect(x: number, y: number, w: number, h: number): Context2d;
    clip(): Context2d;
    closePath(): Context2d;
    createImageData(imageDataOrSw: any, sh?: number): Context2d;
    createLinearGradient(x0: number, y0: number, x1: number, y1: number): Context2d;
    createPattern(image: HTMLElement, repetition: string): Context2d;
    createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): Context2d;
    drawImage(image: HTMLElement, offsetX: number, offsetY: number, width?: number, height?: number, canvasOffsetX?: number, canvasOffsetY?: number, canvasImageWidth?: number, canvasImageHeight?: number): Context2d;
    fill(): Context2d;
    fillRect(x: number, y: number, w: number, h: number): Context2d;
    fillText(text: string, x: number, y: number, maxWidth?: number): Context2d;
    getImageData(sx: number, sy: number, sw: number, sh: number): Context2d;
    getLineDash(): Context2d;
    isPointInPath(x: number, y: number): Context2d;
    isPointInStroke(x: number, y: number): Context2d;
    lineTo(x: number, y: number): Context2d;
    measureText(text: string): Context2d;
    moveTo(x: number, y: number): Context2d;
    putImageData(imagedata: ImageData, dx: number, dy: number, dirtyX?: number, dirtyY?: number, dirtyWidth?: number, dirtyHeight?: number): Context2d;
    quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): Context2d;
    rect(x: number, y: number, w: number, h: number): Context2d;
    restore(): Context2d;
    rotate(angle: number): Context2d;
    save(): Context2d;
    scale(x: number, y: number): Context2d;
    setLineDash(): Context2d;
    setTransform(m11: number, m12: number, m21: number, m22: number, dx: number, dy: number): Context2d;
    stroke(): Context2d;
    strokeRect(x: number, y: number, w: number, h: number): Context2d;
    strokeText(text: string, x: number, y: number, maxWidth?: number): Context2d;
    transform(m11: number, m12: number, m21: number, m22: number, dx: number, dy: number): Context2d;
    translate(x: number, y: number): Context2d;
}

var context2dPDM = {

    // private properties
    _uid: {
        enumerable: DEBUG,
        value: ''
    },
    _remote: {
        enumerable: DEBUG,
        set: function (null_) {
            if (null_ === null) {
                rdp(`${this._uid} = null`);
                Object.defineProperty(this, '_uid', { value: null });
            } else
                logger.error('"_remote" can only be set to "null"')
        }
    },

    // Attributes || proxies with defaults
    fillStyle_: { writable: true, enumerable: DEBUG, value: '#000000' },
    font_: { writable: true, enumerable: DEBUG, value: '10px sans-serif' },
    globalAlpha_: { writable: true, enumerable: DEBUG, value: 1.0 },
    globalCompositeOperation_: { writable: true, enumerable: DEBUG, value: 'source-over' },
    lineCap_: { writable: true, enumerable: DEBUG, value: 'butt' },
    lineDashOffset_: { writable: true, enumerable: DEBUG, value: 0 },
    lineJoin_: { writable: true, enumerable: DEBUG, value: 'miter' },
    lineWidth_: { writable: true, enumerable: DEBUG, value: 1.0 },
    miterLimit_: { writable: true, enumerable: DEBUG, value: 10 },
    shadowBlur_: { writable: true, enumerable: DEBUG, value: 0 },
    shadowColor_: { writable: true, enumerable: DEBUG, value: 'rgba(0, 0, 0, 0)' },
    shadowOffsetX_: { writable: true, enumerable: DEBUG, value: 0 },
    shadowOffsetY_: { writable: true, enumerable: DEBUG, value: 0 },
    strokeStyle_: { writable: true, enumerable: DEBUG, value: '#000000' },
    textAlign_: { writable: true, enumerable: DEBUG, value: 'start' },
    textBaseline_: { writable: true, enumerable: DEBUG, value: 'alphabetic' },
    webkitBackingStorePixelRatio_: { writable: true, enumerable: DEBUG, value: 1 },
    webkitImageSmoothingEnabled_: { writable: true, enumerable: DEBUG, value: true },

    // Web API: https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingcontext2d

    // Attributes || getters/setters || https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingcontext2d#Attributes
    canvas: {
        enumerable: true, value: null // will be overridden on creation
    },
    fillStyle: {
        enumerable: true, get: function () { return this.fillStyle_; },
        set: function (fillStyle) {
            rdp(`${this._uid}.fillStyle = ${fillStyle._uid || `'${fillStyle}'`}`);
            return this.fillStyle_ = fillStyle;
        }
    },
    font: {
        enumerable: true, get: function () { return this.font_; },
        set: function (font) {
            rdp(`${this._uid}.font = '${font}'`);
            return this.font_ = font;
        }
    },
    globalAlpha: {
        enumerable: true, get: function () { return this.globalAlpha_; },
        set: function (globalAlpha) {
            rdp(`${this._uid}.globalAlpha = ${globalAlpha}`);
            return this.globalAlpha_ = globalAlpha;
        }
    },
    globalCompositeOperation: {
        enumerable: true, get: function () { return this.globalCompositeOperation_; },
        set: function (globalCompositeOperation) {
            rdp(`${this._uid}.globalCompositeOperation = '${globalCompositeOperation}'`);
            return this.globalCompositeOperation_ = globalCompositeOperation;
        }
    },
    lineCap: {
        enumerable: true, get: function () { return this.lineCap_; },
        set: function (lineCap) {
            rdp(`${this._uid}.lineCap = '${lineCap}'`);
            return this.lineCap_ = lineCap;
        }
    },
    lineDashOffset: {
        enumerable: true, get: function () { return this.lineDashOffset_; },
        set: function (lineDashOffset) {
            rdp(`${this._uid}.lineDashOffset = ${lineDashOffset}`);
            return this.lineDashOffset_ = lineDashOffset;
        }
    },
    lineJoin: {
        enumerable: true, get: function () { return this.lineJoin_; },
        set: function (lineJoin) {
            rdp(`${this._uid}.lineJoin = '${lineJoin}'`);
            return this.lineJoin_ = lineJoin;
        }
    },
    lineWidth: {
        enumerable: true, get: function () { return this.lineWidth_; },
        set: function (lineWidth) {
            rdp(`${this._uid}.lineWidth = ${lineWidth}`);
            return this.lineWidth_ = lineWidth;
        }
    },
    miterLimit: {
        enumerable: true, get: function () { return this.miterLimit_; },
        set: function (miterLimit) {
            rdp(`${this._uid}.miterLimit = ${miterLimit}`);
            return this.miterLimit_ = miterLimit;
        }
    },
    shadowBlur: {
        enumerable: true, get: function () { return this.shadowBlur_; },
        set: function (shadowBlur) {
            rdp(`${this._uid}.shadowBlur = ${shadowBlur}`);
            return this.shadowBlur_ = shadowBlur;
        }
    },
    shadowColor: {
        enumerable: true, get: function () { return this.shadowColor; },
        set: function (shadowColor) {
            rdp(`${this._uid}.shadowColor = '${shadowColor}'`);
            return this.shadowColor_ = shadowColor;
        }
    },
    shadowOffsetX: {
        enumerable: true, get: function () { return this.shadowOffsetX_; },
        set: function (shadowOffsetX) {
            rdp(`${this._uid}.shadowOffsetX = ${shadowOffsetX}`);
            return this.shadowOffsetX_ = shadowOffsetX;
        }
    },
    shadowOffsetY: {
        enumerable: true, get: function () { return this.shadowOffsetY_; },
        set: function (shadowOffsetY) {
            rdp(`${this._uid}.shadowOffsetY = ${shadowOffsetY}`);
            return this.shadowOffsetY_ = shadowOffsetY;
        }
    },
    strokeStyle: {
        enumerable: true, get: function () { return this.strokeStyle_; },
        set: function (strokeStyle) {
            rdp(`${this._uid}.strokeStyle =  ${strokeStyle._uid || `'${strokeStyle}'`}`);
            return this.strokeStyle_ = strokeStyle;
        }
    },
    textAlign: {
        enumerable: true, get: function () { return this.textAlign_; },
        set: function (textAlign) {
            rdp(`${this._uid}.textAlign = '${textAlign}'`);
            return this.textAlign_ = textAlign;
        }
    },
    textBaseline: {
        enumerable: true, get: function () { return this.textBaseline_; },
        set: function (textBaseline) {
            rdp(`${this._uid}.textBaseline = '${textBaseline}'`);
            return this.textBaseline_ = textBaseline;
        }
    },
    webkitBackingStorePixelRatio: {
        enumerable: true, get: function () { return this.webkitBackingStorePixelRatio_; },
        set: function (webkitBackingStorePixelRatio) {
            rdp(`${this._uid}.webkitBackingStorePixelRatio = ${webkitBackingStorePixelRatio}`);
            return this.webkitBackingStorePixelRatio_ = webkitBackingStorePixelRatio;
        }
    },
    webkitImageSmoothingEnabled: {
        enumerable: true, get: function () { return this.webkitImageSmoothingEnabled_; },
        set: function (webkitImageSmoothingEnabled) {
            rdp(`${this._uid}.webkitImageSmoothingEnabled = ${webkitImageSmoothingEnabled}`);
            return this.webkitImageSmoothingEnabled_ = webkitImageSmoothingEnabled;
        }
    },

    // Methods || https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingcontext2d#Methods
    arc: { //RETURN/ void //IN/ in float x, in float y, in float radius, in float startAngle, in float endAngle, in boolean anticlockwise Optional
        enumerable: true,
        value: function (x, y, radius, startAngle, endAngle, anticlockwise) {
            return rdp(`${this._uid}.arc(${Array.prototype.slice.call(arguments, 0).join(',')})`);
        }
    },

    arcTo: { //RETURN/ void //IN/ in float x1, in float y1, in float x2, in float y2, in float radius
        enumerable: true,
        value: function (x1, y1, x2, y2, radius) {
            return rdp(`${this._uid}.arcTo(${x1},${y1},${x2},${y2},${radius})`);
        }
    },

    beginPath: { //RETURN/ void //IN/  
        enumerable: true,
        value: function () {
            return rdp(`${this._uid}.beginPath()`);
        }
    },

    bezierCurveTo: { //RETURN/ void //IN/ in float cp1x, in float cp1y, in float cp2x, in float cp2y, in float x, in float y
        enumerable: true,
        value: function (cp1x, cp1y, cp2x, cp2y, x, y) {
            return rdp(`${this._uid}.bezierCurveTo(${cp1x},${cp1y},${cp2x},${cp2y},${x},${y})`);
        }
    },

    clearRect: { //RETURN/ void //IN/ in float x, in float y, in float width, in float height
        enumerable: true,
        value: function (x, y, width, height) {
            return rdp(`${this._uid}.clearRect(${x},${y},${width},${height})`);
        }
    },

    clip: { //RETURN/ void //IN/  
        enumerable: true,
        value: function () {
            return rdp(`${this._uid}.clip()`);
        }
    },

    closePath: { //RETURN/ void //IN/  
        enumerable: true,
        value: function () {
            return rdp(`${this._uid}.closePath()`);
        }
    },

    createImageData: { //RETURN/ ImageData //IN/ in float width, in float height
        enumerable: true,
        value: function (width, height) {

            if (width.height != undefined) { // if image data is passed
                height = width.height;
                width = width.width;
            }

            return (callback) => {
                callback(null, {
                    data: new Uint8ClampedArray(Array.apply(null, new Array(width * height * 4)).map(Number.prototype.valueOf, 0)),
                    width: width,
                    height: height
                });
            };
        }
    },

    createLinearGradient: { //RETURN/ nsIDOMCanvasGradient //IN/ in float x0, in float y0, in float x1, in float y1
        enumerable: true,
        value: function (x0, y0, x1, y1) {
            var uid = NCC.uid('linearGradient')
            rdp(`var ${uid} = ${this._uid}.createLinearGradient(${x0},${y0},${x1},${y1})`);

            var linearGradient: any = (callback?) => {
                rdp(callback ? (err, res) => {
                    err ? callback(err, null) : callback(null, linearGradient);
                } : undefined);
                return linearGradient;
            }

            GradientPDM._uid.value = uid;
            Object.defineProperties(linearGradient, GradientPDM);
            GradientPDM._uid.value = '';
            return linearGradient;
        }
    },

    createPattern: { //RETURN/ nsIDOMCanvasPattern //IN/ in nsIDOMHTMLElement image, in DOMString repetition
        enumerable: true,
        value: function (image, repetition) {

            var uid = NCC.uid('pattern');
            rdp(`var ${uid} = ${this._uid}.createPattern(${image._uid},'${repetition}')`);

            var pattern: any = (callback?) => {
                rdp(callback ? (err, res) => {
                    err ? callback(err, null) : callback(null, pattern);
                } : undefined);
                return pattern;
            }

            PatternPDM._uid.value = uid;
            Object.defineProperties(pattern, PatternPDM);
            PatternPDM._uid.value = '';

            return pattern;
        }
    },

    createRadialGradient: { //RETURN/ nsIDOMCanvasGradient //IN/ in float x0, in float y0, in float r0, in float x1, in float y1, in float r1
        enumerable: true,
        value: function (x0, y0, r0, x1, y1, r1) {

            var uid = NCC.uid('pattern')
            rdp(`var ${uid} = ${this._uid}.createRadialGradient(${x0},${y0},${r0},${x1},${y1},${r1})`);

            var radialGradient: any = (callback?) => {
                rdp(callback ? (err, res) => {
                    err ? callback(err, null) : callback(null, radialGradient);
                } : undefined);
                return radialGradient;
            }

            GradientPDM._uid.value = NCC.uid('radialGradient');
            Object.defineProperties(radialGradient, GradientPDM);
            GradientPDM._uid.value = '';

            return radialGradient;
        }
    },

    drawImage: { //RETURN/ void //IN/ in nsIDOMElement image, in float a1, in float a2, in float a3 Optional, in float a4 Optional, in float a5 Optional, in float a6 Optional, in float a7 Optional, in float a8 Optional
        enumerable: true,
        value: function (image, a1, a2, a3, a4, a5, a6, a7, a8) {
            return rdp(`${this._uid}.drawImage(${image._uid}, ${Array.prototype.slice.call(arguments, 1).join(',')})`);
        }
    },

    // no use
    //drawCustomFocusRing: { //RETURN/ boolean //IN/ Element element
    //    enumerable:true,
    //    value: function (element) {
    //        rdp(`${this._uid}.drawCustomFocusRing(" + element + ")`);
    //        return this;
    //    }
    //},

    // no use
    //drawSystemFocusRing: { //RETURN/ void //IN/ Element element
    //    enumerable:true,
    //    value: function (element) {
    //        rdp(`${this._uid}.drawSystemFocusRinelementg()`);
    //        return this;
    //    }
    //},

    fill: { //RETURN/ void //IN/  
        enumerable: true,
        value: function () {
            return rdp(`${this._uid}.fill()`);
        }
    },

    fillRect: { //RETURN/ void //IN/ in float x, in float y, in float width, in float height
        enumerable: true,
        value: function (x, y, width, height) {
            return rdp(`${this._uid}.fillRect(${x},${y},${width},${height})`);
        }
    },

    fillText: { //RETURN/ void //IN/ in DOMString text, in float x, in float y, in float maxWidth Optional
        enumerable: true,
        value: function (text, x, y, maxWidth) {
            return rdp(`${this._uid}.fillText('${text}',${Array.prototype.slice.call(arguments, 1).join(',')})`);
        }
    },

    getImageData: { //RETURN/ //IN/ in float x, in float y, in float width, in float height
        enumerable: true,
        value: function (x, y, width, height) {
            rdp(`Array.prototype.slice.call(${this._uid}.getImageData(${x},${y},${width},${height}).data).join(',')`);
            return (callback) => {
                rdp((err, res) => {
                    if (err)
                        return callback(err, null);

                    var imageData = {
                        data: new Uint8ClampedArray(res.value.split(',')),
                        width: width,
                        height: height
                    };

                    callback(null, imageData);
                });
            };
        }
    },

    getLineDash: { //RETURN/ sequence <unrestricted double> //IN/  
        enumerable: true,
        value: function () {
            rdp(`${this._uid}.getLineDash().join(',')`);
            return (callback) => {
                rdp((err, res) => {
                    if (err)
                        return callback(err);

                    res.value = res.value.split(',');
                    for (var i = 0, l = res.value.length; i < l; i++)
                        res.value[i] = +res.value[i];

                    callback(err, res.value);
                });
            };
        }
    },

    isPointInPath: { //RETURN/ boolean //IN/ in float x, in float y
        enumerable: true,
        value: function (x, y) {
            rdp(`${this._uid}.isPointInPath(${x},${y})`);
            return (callback) => {
                rdp((err, res) => {
                    callback(err, res.value);
                });
            };
        }
    },

    isPointInStroke: { //RETURN/ boolean //IN/ in float x, in float y
        enumerable: true,
        value: function (x, y) {
            rdp(`${this._uid}.isPointInStroke(${x},${y})`);
            return (callback) => {
                rdp((err, res) => {
                    callback(err, res.value);
                });
            };
        }
    },

    lineTo: { //RETURN/ void //IN/ in float x, in float y
        enumerable: true,
        value: function (x, y) {
            return rdp(`${this._uid}.lineTo(${x},${y})`);
        }
    },

    measureText: { //RETURN/ nsIDOMTextMetrics //IN/ in DOMString text
        enumerable: true,
        value: function (text) {
            rdp(`${this._uid}.measureText('${text}').width`);
            return (callback) => {
                rdp((err, res) => {
                    if (err)
                        return callback(err);

                    callback(null, { width: res.value });
                });
            };
        }
    },

    moveTo: { //RETURN/ void //IN/ in float x, in float y
        enumerable: true,
        value: function (x, y) {
            return rdp(`${this._uid}.moveTo(${x},${y})`);
        }
    },

    putImageData: { //RETURN/ void //IN/ in ImageData imagedata, in float dx, double dy, in float dirtyX Optional, in float dirtyY Optional, in float dirtyWidth Optional, in float dirtyHeight Optional
        enumerable: true,
        value: function (imagedata, dx, dy, dirtyX, dirtyY, dirtyWidth, dirtyHeight) {
            return rdp(`var data = [${Array.prototype.slice.call(imagedata.data).join(',')}]; var iD = ${this._uid}.createImageData(${imagedata.width}, ${imagedata.height}); for (var i = 0, l = iD.data.length; i < l; i++) iD.data[i] = +data[i]; ${this._uid}.putImageData(iD, ${Array.prototype.slice.call(arguments, 1).join(',')})`);
        }
    },

    quadraticCurveTo: { //RETURN/ void //IN/ in float cpx, in float cpy, in float x, in float y
        enumerable: true,
        value: function (cpx, cpy, x, y) {
            return rdp(`${this._uid}.quadraticCurveTo(${cpx},${cpy},${x},${y})`);
        }
    },

    rect: { //RETURN/ void //IN/ in float x, in float y, in float width, in float height
        enumerable: true,
        value: function (x, y, width, height) {
            return rdp(`${this._uid}.rect(${x},${y},${width},${height})`);
        }
    },

    restore: { //RETURN/ void //IN/  
        enumerable: true,
        value: function () {
            return rdp(`${this._uid}.restore()`);
        }
    },

    rotate: { //RETURN/ void //IN/ in float angle
        enumerable: true,
        value: function (angle) {
            return rdp(`${this._uid}.rotate(${angle})`);
        }
    },

    save: { //RETURN/ void //IN/  
        enumerable: true,
        value: function () {
            return rdp(`${this._uid}.save()`);
        }
    },

    scale: { //RETURN/ void //IN/ in float x, in float y
        enumerable: true,
        value: function (x, y) {
            return rdp(`${this._uid}.scale(${x},${y})`);
        }
    },

    // no use
    //scrollPathIntoView: { //RETURN/ void //IN/  
    //    enumerable: true,
    //    value: function () {
    //        rdp(`${this._uid}.scrollPathIntoView()`);
    //        return this;
    //    }
    //},

    setLineDash: { //RETURN/ void //IN/ in sequence <unrestricted double> segments
        enumerable: true,
        value: function (segments) {
            return rdp(`${this._uid}.setLineDash([${segments.join(',')}])`);
        }
    },

    setTransform: { //RETURN/ void //IN/ in float m11, in float m12, in float m21, in float m22, in float dx, in float dy
        enumerable: true,
        value: function (m11, m12, m21, m22, dx, dy) {
            return rdp(`${this._uid}.setTransform(${m11},${m12},${m21},${m22},${dx},${dy})`);
        }
    },

    stroke: { //RETURN/ void //IN/  
        enumerable: true,
        value: function () {
            return rdp(`${this._uid}.stroke()`);
        }
    },

    strokeRect: { //RETURN/ void //IN/ in float x, in float y, in float w, in float h
        enumerable: true,
        value: function (x, y, w, h) {
            return rdp(`${this._uid}.strokeRect(${x},${y},${w},${h})`);
        }
    },

    strokeText: { //RETURN/ void //IN/ in DOMString text, in float x, in float y, in float maxWidth Optional
        enumerable: true,
        value: function (text, x, y, maxWidth) {
            rdp(`${this._uid}.strokeText('${text}',${(Array.prototype.slice.call(arguments, 1).join(','))})`);
            return this;
        }
    },

    transform: { //RETURN/ void //IN/ in float m11, in float m12, in float m21, in float m22, in float dx, in float dy
        enumerable: true,
        value: function (m11, m12, m21, m22, dx, dy) {
            return rdp(`${this._uid}.transform(${m11},${m12},${m21},${m22},${dx},${dy})`);
        }
    },

    translate: { //RETURN/ void //IN/ in float x, in float y
        enumerable: true,
        value: function (x, y) {
            return rdp(`${this._uid}.translate(${x},${y})`);
        }
    }

};


// Gradient
interface Gradient extends ProxyObj {
    (callback?): Gradient;
    addColorStop(offset: number, color: string): Callback;
}

var GradientPDM = {

    // private properties
    _uid: {
        enumerable: DEBUG,
        value: ''
    },
    _remote: {
        enumerable: DEBUG,
        set: function (null_) {
            if (null_ === null) {
                rdp(`${this._uid} = null`);
                Object.defineProperty(this, '_uid', { value: null });
            } else
                logger.error('"_remote" can only be set to "null"')
        }
    },

    // Web API: https://developer.mozilla.org/en-US/docs/Web/API/CanvasGradient

    // Methods

    addColorStop: {
        enumerable: true,
        value: function (offset, color) {
            return rdp(`${this._uid}.addColorStop(${offset},'${color}')`);
        }
    }
};


// Pattern
interface Pattern extends ProxyObj {
    (callback?): Pattern;
}

var PatternPDM = {

    // private properties
    _uid: {
        enumerable: DEBUG,
        value: ''
    },
    _remote: {
        enumerable: DEBUG,
        set: function (null_) {
            if (null_ === null) {
                rdp(`${this._uid} = null`);
                Object.defineProperty(this, '_uid', { value: null });
            } else
                logger.error('"_remote" can only be set to "null"')
        }
    },

    // Web API: https://developer.mozilla.org/en-US/docs/Web/API/CanvasPattern
};


// Image
interface Image extends ProxyObj {
    (callback?): Image;
    _base64: string;
    _toFile(): any;
    src: string;
    onload(): any;
    onerror(): any;
    width: number;
    height: number;
}

var mimeMap = {
    png: 'image/png',
    webp: 'image/webp',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    svg: 'image/svg+xml',
    gif: 'image/gif'
};

var regExp_http = new RegExp('^(http:\\/\\/.+)', 'i');
var regExp_data = new RegExp('^(data:image\\/\\w+;base64,.+)');
var regExp_type = new RegExp('^data:image\\/(\\w+);base64,');


var ImagePDM = {

    // private properties
    _uid: {
        enumerable: DEBUG,
        value: ''
    },
    _remote: {
        enumerable: DEBUG,
        set: function (null_) {
            if (null_ === null) {
                rdp(`${this._uid} = null`);
                Object.defineProperty(this, '_uid', { value: null });
            } else
                logger.error('"_remote" can only be set to "null"')
        }
    },

    // Properties
    src_: {
        enumerable: DEBUG,
        writable: true,
        value: ''
    },
    width_: {
        enumerable: DEBUG,
        writable: true,
        value: undefined
    },
    height_: {
        enumerable: DEBUG,
        writable: true,
        value: undefined
    },
    _base64_: {
        enumerable: DEBUG,
        writable: true,
        value: null
    },
    _base64: {
        enumerable: DEBUG,
        get: function () {
            return this._base64_;
        },
        set: function (base64) {
            rdp(`${this._uid}.src = '${base64}'`);
            rdp(() => {
                rdp(`${this._uid}.width + '_' + ${this._uid}.height`);
                rdp((err, res) => {
                    if (err && this.onerror)
                        return this.onerror(err);

                    var size = res.value.split('_');
                    this.width_ = +size[0];
                    this.height_ = +size[1];

                    if (this.onload)
                        return this.onload(this);
                });
            });

            this._base64_ = base64;
            return this._base64_;
        }
    },

    // Methods
    _toFile: {
        enumerable: DEBUG,
        value: function (filename, callback) {
            var head = regExp_type.exec(this._base64_),
                type = filename.split('.').pop();


            if (!head || !head[1] || (head[1] != ((type == "jpg") ? "jpeg" : type)))
                if (callback) return callback(`type mismatch ${head ? head[1] : "'unknown'"} !> ${type}`);
                else throw new Error(`type mismatch ${head ? head[1] : "'unknown'"} !> ${type}`)

            logger.info(`[ncc] writing image to: ${filename}`);
            fs.writeFile(filename, new Buffer(this._base64_.replace(/^data:image\/\w+;base64,/, ''), 'base64'), {}, callback);
        }
    },

    // Web API

    // Properties
    src: {
        enumerable: true,
        get: function () {
            return this.src_;
        },
        set: function (src) {
            var img = this;
            this._src = src;
            if (!src || src === '') return;

            if (regExp_data.test(src)) img._base64 = src;
            else if (regExp_http.test(src)) {
                logger.info(`[ncc] loading image from URL: ${src}`);
                http.get(src, function (res) {
                    var data = '';
                    res.setEncoding('base64');

                    if (res.statusCode != 200) {
                        if (img.onerror) return img.onerror(`loading image failed with status ${res.statusCode}`);
                        else logger.error(`loading image failed with status ${res.statusCode}`);
                    }

                    res.on('data', function (chunk) { data += chunk; });

                    res.on('end', function () {
                        img._base64 = `data:${(res.headers["content-type"] || mimeMap[src.split('.').pop()])};base64,${data}`;
                        logger.info('[ncc] loading image from URL completed');
                    });

                }).on('error', this.onerror || function (err) {
                    if (img.onerror) return img.onerror(err);
                    else logger.error(`loading image failed with err ${err}`);
                });
            } else {
                logger.info(`[ncc] loading image from FS: ${src}`);
                fs.readFile(src, 'base64', function (err, data) {
                    if (err) {
                        if (img.onerror) img.onerror(err);
                        else logger.error(`loading image failed with err ${err}`);
                    }
                    img._base64 = `data:${mimeMap[src.split('.').pop()]};base64,${data}`;
                    logger.info('[ncc] loading image from FS completed');
                });
            }
            return this.src_;
        }
    },
    onload: {
        writable: true,
        enumerable: true,
        value: undefined
    },
    onerror: {
        writable: true,
        enumerable: true,
        value: undefined
    },
    width: {
        enumerable: true,
        get: function () {
            return this.width_;
        }
    },
    height: {
        enumerable: true,
        get: function () {
            return this.height_;
        }
    }

};


module.exports = NCC;