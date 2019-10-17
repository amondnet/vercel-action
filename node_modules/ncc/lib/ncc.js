/**
 * This is a stripped down and bundeled version of
 * - https://github.com/GoogleChrome/lighthouse/blob/master/lighthouse-cli/chrome-launcher.ts
 * - https://github.com/GoogleChrome/lighthouse/blob/master/lighthouse-cli/chrome-finder.ts
 * It be replaced when the ChromeLauncher becomes a module: https://github.com/GoogleChrome/lighthouse/issues/2092
 * But for now this saves us about 60 MB of modules
 */
/**
 * @license
 * Copyright 2016 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';
var ChromeLauncher = (() => {
    var childProcess = require('child_process');
    var fs = require('fs');
    var path = require('path');
    const mkdirp = require('mkdirp');
    var net = require('net');
    const rimraf = require('rimraf');
    const spawn = childProcess.spawn;
    const execSync = childProcess.execSync;
    const isWindows = process.platform === 'win32';
    const execFileSync = require('child_process').execFileSync;
    const newLineRegex = /\r?\n/;
    function darwin() {
        const suffixes = ['/Contents/MacOS/Google Chrome Canary', '/Contents/MacOS/Google Chrome'];
        const LSREGISTER = '/System/Library/Frameworks/CoreServices.framework' +
            '/Versions/A/Frameworks/LaunchServices.framework' +
            '/Versions/A/Support/lsregister';
        const installations = [];
        execSync(`${LSREGISTER} -dump` +
            ' | grep -i \'google chrome\\( canary\\)\\?.app$\'' +
            ' | awk \'{$1=""; print $0}\'')
            .toString()
            .split(newLineRegex)
            .forEach((inst) => {
            suffixes.forEach(suffix => {
                const execPath = path.join(inst.trim(), suffix);
                if (canAccess(execPath)) {
                    installations.push(execPath);
                }
            });
        });
        // Retains one per line to maintain readability.
        // clang-format off
        const priorities = [
            { regex: new RegExp(`^${process.env.HOME}/Applications/.*Chrome.app`), weight: 50 },
            { regex: new RegExp(`^${process.env.HOME}/Applications/.*Chrome Canary.app`), weight: 51 },
            { regex: /^\/Applications\/.*Chrome.app/, weight: 100 },
            { regex: /^\/Applications\/.*Chrome Canary.app/, weight: 101 },
            { regex: /^\/Volumes\/.*Chrome.app/, weight: -2 },
            { regex: /^\/Volumes\/.*Chrome Canary.app/, weight: -1 }
        ];
        // clang-format on
        return sort(installations, priorities);
    }
    /**
     * Look for linux executables in 3 ways
     * 1. Look into LIGHTHOUSE_CHROMIUM_PATH env variable
     * 2. Look into the directories where .desktop are saved on gnome based distro's
     * 3. Look for google-chrome-stable & google-chrome executables by using the which command
     */
    function linux() {
        let installations = [];
        // 1. Look into LIGHTHOUSE_CHROMIUM_PATH env variable
        if (canAccess(process.env.LIGHTHOUSE_CHROMIUM_PATH)) {
            installations.push(process.env.LIGHTHOUSE_CHROMIUM_PATH);
        }
        // 2. Look into the directories where .desktop are saved on gnome based distro's
        const desktopInstallationFolders = [
            path.join(require('os').homedir(), '.local/share/applications/'),
            '/usr/share/applications/',
        ];
        desktopInstallationFolders.forEach(folder => {
            installations = installations.concat(findChromeExecutables(folder));
        });
        // Look for google-chrome-stable & google-chrome executables by using the which command
        const executables = [
            'google-chrome-stable',
            'google-chrome',
        ];
        executables.forEach((executable) => {
            try {
                const chromePath = execFileSync('which', [executable]).toString().split(newLineRegex)[0];
                if (canAccess(chromePath)) {
                    installations.push(chromePath);
                }
            }
            catch (e) {
                // Not installed.
            }
        });
        if (!installations.length) {
            throw new Error('The environment variable LIGHTHOUSE_CHROMIUM_PATH must be set to ' +
                'executable of a build of Chromium version 54.0 or later.');
        }
        const priorities = [
            { regex: /chrome-wrapper$/, weight: 51 }, { regex: /google-chrome-stable$/, weight: 50 },
            { regex: /google-chrome$/, weight: 49 },
            { regex: new RegExp(process.env.LIGHTHOUSE_CHROMIUM_PATH), weight: 100 }
        ];
        return sort(uniq(installations.filter(Boolean)), priorities);
    }
    function win32() {
        const installations = [];
        const suffixes = [
            '\\Google\\Chrome SxS\\Application\\chrome.exe', '\\Google\\Chrome\\Application\\chrome.exe'
        ];
        const prefixes = [process.env.LOCALAPPDATA, process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)']];
        if (canAccess(process.env.LIGHTHOUSE_CHROMIUM_PATH)) {
            installations.push(process.env.LIGHTHOUSE_CHROMIUM_PATH);
        }
        prefixes.forEach(prefix => suffixes.forEach(suffix => {
            const chromePath = path.join(prefix, suffix);
            if (canAccess(chromePath)) {
                installations.push(chromePath);
            }
        }));
        return installations;
    }
    function sort(installations, priorities) {
        const defaultPriority = 10;
        return installations
            .map((inst) => {
            for (const pair of priorities) {
                if (pair.regex.test(inst)) {
                    return [inst, pair.weight];
                }
            }
            return [inst, defaultPriority];
        })
            .sort((a, b) => b[1] - a[1])
            .map(pair => pair[0]);
    }
    function canAccess(file) {
        if (!file) {
            return false;
        }
        try {
            fs.accessSync(file);
            return true;
        }
        catch (e) {
            return false;
        }
    }
    function uniq(arr) {
        return Array.from(new Set(arr));
    }
    function findChromeExecutables(folder) {
        const argumentsRegex = /(^[^ ]+).*/; // Take everything up to the first space
        const chromeExecRegex = '^Exec=\/.*\/(google|chrome|chromium)-.*';
        let installations = [];
        if (canAccess(folder)) {
            // Output of the grep & print looks like:
            //    /opt/google/chrome/google-chrome --profile-directory
            //    /home/user/Downloads/chrome-linux/chrome-wrapper %U
            let execPaths = execSync(`grep -ER "${chromeExecRegex}" ${folder} | awk -F '=' '{print $2}'`)
                .toString()
                .split(newLineRegex)
                .map((execPath) => execPath.replace(argumentsRegex, '$1'));
            execPaths.forEach((execPath) => canAccess(execPath) && installations.push(execPath));
        }
        return installations;
    }
    var chromeFinder = {
        darwin: darwin,
        linux: linux,
        win32: win32
    };
    class ChromeLauncher {
        constructor(opts = {}) {
            this.prepared = false;
            this.pollInterval = 500;
            // choose the first one (default)
            this.autoSelectChrome = defaults(opts.autoSelectChrome, true);
            this.startingUrl = defaults(opts.startingUrl, 'about:blank');
            this.chromeFlags = defaults(opts.chromeFlags, []);
            this.port = defaults(opts.port, 9222);
        }
        flags() {
            const flags = [
                `--remote-debugging-port=${this.port}`,
                // Disable built-in Google Translate service
                '--disable-translate',
                // Disable all chrome extensions entirely
                '--disable-extensions',
                // Disable various background network services, including extension updating,
                //   safe browsing service, upgrade detector, translate, UMA
                '--disable-background-networking',
                // Disable fetching safebrowsing lists, likely redundant due to disable-background-networking
                '--safebrowsing-disable-auto-update',
                // Disable syncing to a Google account
                '--disable-sync',
                // Disable reporting to UMA, but allows for collection
                '--metrics-recording-only',
                // Disable installation of default apps on first run
                '--disable-default-apps',
                // Skip first run wizards
                '--no-first-run',
                // Place Chrome profile in a custom location we'll rm -rf later
                `--user-data-dir=${this.TMP_PROFILE_DIR}`
            ];
            if (process.platform === 'linux') {
                flags.push('--disable-setuid-sandbox');
            }
            flags.push(...this.chromeFlags);
            flags.push(this.startingUrl);
            return flags;
        }
        prepare() {
            switch (process.platform) {
                case 'darwin':
                case 'linux':
                    this.TMP_PROFILE_DIR = unixTmpDir();
                    break;
                case 'win32':
                    this.TMP_PROFILE_DIR = win32TmpDir();
                    break;
                default:
                    throw new Error('Platform ' + process.platform + ' is not supported');
            }
            this.outFile = fs.openSync(`${this.TMP_PROFILE_DIR}/chrome-out.log`, 'a');
            this.errFile = fs.openSync(`${this.TMP_PROFILE_DIR}/chrome-err.log`, 'a');
            // fix for Node4
            // you can't pass a fd to fs.writeFileSync
            this.pidFile = `${this.TMP_PROFILE_DIR}/chrome.pid`;
            console.log('ChromeLauncher', `created ${this.TMP_PROFILE_DIR}`);
            this.prepared = true;
        }
        run() {
            if (!this.prepared) {
                this.prepare();
            }
            return Promise.resolve()
                .then(() => {
                const installations = chromeFinder[process.platform]();
                if (installations.length < 1) {
                    return Promise.reject(new Error('No Chrome Installations Found'));
                }
                else if (installations.length === 1 || this.autoSelectChrome) {
                    return installations[0];
                }
                //return ask('Choose a Chrome installation to use with Lighthouse', installations);
            })
                .then(execPath => this.spawn(execPath));
        }
        spawn(execPath) {
            const spawnPromise = new Promise(resolve => {
                if (this.chrome) {
                    console.log('ChromeLauncher', `Chrome already running with pid ${this.chrome.pid}.`);
                    return resolve(this.chrome.pid);
                }
                const chrome = spawn(execPath, this.flags(), { detached: true, stdio: ['ignore', this.outFile, this.errFile] });
                this.chrome = chrome;
                fs.writeFileSync(this.pidFile, chrome.pid.toString());
                console.log('ChromeLauncher', `Chrome running with pid ${chrome.pid} on port ${this.port}.`);
                resolve(chrome.pid);
            });
            return spawnPromise.then(pid => Promise.all([pid, this.waitUntilReady()]));
        }
        cleanup(client) {
            if (client) {
                client.removeAllListeners();
                client.end();
                client.destroy();
                client.unref();
            }
        }
        // resolves if ready, rejects otherwise
        isDebuggerReady() {
            return new Promise((resolve, reject) => {
                const client = net.createConnection(this.port);
                client.once('error', err => {
                    this.cleanup(client);
                    reject(err);
                });
                client.once('connect', () => {
                    this.cleanup(client);
                    resolve();
                });
            });
        }
        // resolves when debugger is ready, rejects after 10 polls
        waitUntilReady() {
            const launcher = this;
            return new Promise((resolve, reject) => {
                let retries = 0;
                let waitStatus = 'Waiting for browser.';
                (function poll() {
                    if (retries === 0) {
                        console.log('ChromeLauncher', waitStatus);
                    }
                    retries++;
                    waitStatus += '..';
                    console.log('ChromeLauncher', waitStatus);
                    launcher.isDebuggerReady()
                        .then(() => {
                        console.log('ChromeLauncher', waitStatus);
                        resolve();
                    })
                        .catch(err => {
                        if (retries > 10) {
                            return reject(err);
                        }
                        delay(launcher.pollInterval).then(poll);
                    });
                })();
            });
        }
        kill() {
            return new Promise(resolve => {
                if (this.chrome) {
                    this.chrome.on('close', () => {
                        this.destroyTmp().then(resolve);
                    });
                    console.log('ChromeLauncher', 'Killing all Chrome Instances');
                    try {
                        if (isWindows) {
                            execSync(`taskkill /pid ${this.chrome.pid} /T /F`);
                        }
                        else {
                            process.kill(-this.chrome.pid);
                        }
                    }
                    catch (err) {
                        console.log('ChromeLauncher', `Chrome could not be killed ${err.message}`);
                    }
                    delete this.chrome;
                }
                else {
                    // fail silently as we did not start chrome
                    resolve();
                }
            });
        }
        destroyTmp() {
            return new Promise(resolve => {
                if (!this.TMP_PROFILE_DIR) {
                    return resolve();
                }
                console.log('ChromeLauncher', `Removing ${this.TMP_PROFILE_DIR}`);
                if (this.outFile) {
                    fs.closeSync(this.outFile);
                    delete this.outFile;
                }
                if (this.errFile) {
                    fs.closeSync(this.errFile);
                    delete this.errFile;
                }
                rimraf(this.TMP_PROFILE_DIR, () => resolve());
            });
        }
    }
    ;
    function defaults(val, def) {
        return typeof val === 'undefined' ? def : val;
    }
    function delay(time) {
        return new Promise(resolve => setTimeout(resolve, time));
    }
    function unixTmpDir() {
        return execSync('mktemp -d -t ncc.XXXXXXX').toString().trim();
    }
    function win32TmpDir() {
        const winTmpPath = process.env.TEMP || process.env.TMP ||
            (process.env.SystemRoot || process.env.windir) + '\\temp';
        const randomNumber = Math.floor(Math.random() * 9e7 + 1e7);
        const tmpdir = path.join(winTmpPath, 'ncc.' + randomNumber);
        mkdirp.sync(tmpdir);
        return tmpdir;
    }
    return ChromeLauncher;
})();
/// <reference path="chrome-launcher.ts" />
var http = require('http'), fs = require('fs'), ws = require('ws'), path = require('path');
var DEBUG = false;
var logger;
var NCC = Object.defineProperties((options_, callback_) => {
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
                    }
                    else
                        logger.error('connection failed');
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
                            });
                        });
                        rdp.ws.send(`{"id":0,"method":"Runtime.evaluate", "params":{"expression":"document.readyState"}}`, err => err && checkReadyState());
                    }
                    checkReadyState();
                });
                rdp.ws.on('close', () => logger.info("session closed"));
            });
        });
    }
    var index = path.join(__dirname, 'ncc.html');
    var launcher = new ChromeLauncher({
        port: NCC.options.port,
        autoSelectChrome: true,
        startingUrl: NCC.options.headless ? index : '',
        chromeFlags: NCC.options.headless ?
            ['--window-size=0,0', '--disable-gpu', '--headless'] :
            [`--app=${index}`]
    });
    const exitHandler = (err) => {
        rdp.ws.terminate();
        launcher.kill().then(() => process.exit(-1));
    };
    process.on('SIGINT', exitHandler);
    process.on('unhandledRejection', exitHandler);
    process.on('rejectionHandled', exitHandler);
    process.on('uncaughtException', exitHandler);
    launcher.run()
        .then((a) => {
        logger.info("chrome started");
        connect();
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
        value: function (width, height, main) {
            if (!main) {
                var uid = NCC.uid('canvas');
                rdp(`var ${uid} = document.createElement('canvas')`);
            }
            var canvas = (callback) => {
                rdp(callback ? (err, res) => {
                    err ? callback(err, null) : callback(null, canvas);
                } : undefined);
                return canvas;
            };
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
        value: function (src, onload, onerror) {
            var uid = NCC.uid('image');
            rdp(`var ${uid} = new Image()`);
            var image = (callback) => {
                rdp(callback ? (err, res) => {
                    err ? callback(err, null) : callback(null, image);
                } : undefined);
                return image;
            };
            ImagePDM._uid.value = uid;
            Object.defineProperties(image, ImagePDM);
            ImagePDM._uid.value = '';
            image.src = src;
            image.onload = onload;
            image.onerror = onerror;
            return image;
        }
    },
    uid: {
        enumerable: false,
        value: type => `${type}_${Math.random().toString(36).slice(2)}`
    }
});
// RDP | Remote Debugging Protocol (the bridge to chrome)
var rdp = Object.defineProperties((_) => {
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
    if (!rdp.queue[0] || rdp.req == rdp.queue[0] || !rdp.ws)
        return rdp;
    rdp.req = rdp.queue[0];
    logger.trace(`> ${rdp.req.cmd.split(';').join(';\n  ')}`);
    rdp.ws.once('message', data => {
        data.error && logger.error(data.error);
        !data.error && logger.log(data.result);
        data = JSON.parse(data);
        var err = data.error || data.result.wasThrown ? data.result.result.description : null, res = err ? null : data.result.result;
        if (rdp.req.callback)
            rdp.req.callback(err, res);
        rdp.req = rdp.queue.shift();
        rdp(null);
    });
    rdp.ws.send(`{"id":0,"method":"Runtime.evaluate", "params":{"expression":"${rdp.req.cmd}"}}`, err => err && rdp());
    return rdp;
}, {
    cmd: { enumerable: DEBUG, writable: true, value: '' },
    queue: { enumerable: DEBUG, value: [] }
});
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
                    return logger.error('you cannot delete the main canvas');
                rdp(`${this._uid} = null`);
                Object.defineProperty(this, '_uid', { value: null });
                this._ctx = null;
            }
            else
                return logger.error('"_remote" can only be set to "null"');
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
            if (width === undefined)
                return;
            rdp(`${this._uid}.width = ${width}`);
            return this.width_ = width;
        }
    },
    height: {
        enumerable: true,
        get: function () {
            return this.height_;
        },
        set: function (height) {
            if (height === undefined)
                return;
            rdp(`${this._uid}.height = ${height}`);
            return this.height_ = height;
        }
    },
    // Methods || https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement#Methods
    getContext: {
        enumerable: true,
        value: function (contextId) {
            if (contextId == '2d') {
                var uid = this._uid == 'canvas' ? 'context2d' : NCC.uid('context2d');
                rdp(`var ${uid} = ${this._uid}.getContext('2d')`);
                var context2d = (callback) => {
                    rdp(callback ? (err, res) => {
                        err ? callback(err, null) : callback(null, context2d);
                    } : undefined);
                    return context2d;
                };
                context2dPDM._uid.value = uid;
                context2dPDM['canvas'].value = this;
                Object.defineProperties(context2d, context2dPDM);
                context2dPDM._uid.value = '';
                return context2d;
            }
            else
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
            }
            else
                logger.error('"_remote" can only be set to "null"');
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
    arc: {
        enumerable: true,
        value: function (x, y, radius, startAngle, endAngle, anticlockwise) {
            return rdp(`${this._uid}.arc(${Array.prototype.slice.call(arguments, 0).join(',')})`);
        }
    },
    arcTo: {
        enumerable: true,
        value: function (x1, y1, x2, y2, radius) {
            return rdp(`${this._uid}.arcTo(${x1},${y1},${x2},${y2},${radius})`);
        }
    },
    beginPath: {
        enumerable: true,
        value: function () {
            return rdp(`${this._uid}.beginPath()`);
        }
    },
    bezierCurveTo: {
        enumerable: true,
        value: function (cp1x, cp1y, cp2x, cp2y, x, y) {
            return rdp(`${this._uid}.bezierCurveTo(${cp1x},${cp1y},${cp2x},${cp2y},${x},${y})`);
        }
    },
    clearRect: {
        enumerable: true,
        value: function (x, y, width, height) {
            return rdp(`${this._uid}.clearRect(${x},${y},${width},${height})`);
        }
    },
    clip: {
        enumerable: true,
        value: function () {
            return rdp(`${this._uid}.clip()`);
        }
    },
    closePath: {
        enumerable: true,
        value: function () {
            return rdp(`${this._uid}.closePath()`);
        }
    },
    createImageData: {
        enumerable: true,
        value: function (width, height) {
            if (width.height != undefined) {
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
    createLinearGradient: {
        enumerable: true,
        value: function (x0, y0, x1, y1) {
            var uid = NCC.uid('linearGradient');
            rdp(`var ${uid} = ${this._uid}.createLinearGradient(${x0},${y0},${x1},${y1})`);
            var linearGradient = (callback) => {
                rdp(callback ? (err, res) => {
                    err ? callback(err, null) : callback(null, linearGradient);
                } : undefined);
                return linearGradient;
            };
            GradientPDM._uid.value = uid;
            Object.defineProperties(linearGradient, GradientPDM);
            GradientPDM._uid.value = '';
            return linearGradient;
        }
    },
    createPattern: {
        enumerable: true,
        value: function (image, repetition) {
            var uid = NCC.uid('pattern');
            rdp(`var ${uid} = ${this._uid}.createPattern(${image._uid},'${repetition}')`);
            var pattern = (callback) => {
                rdp(callback ? (err, res) => {
                    err ? callback(err, null) : callback(null, pattern);
                } : undefined);
                return pattern;
            };
            PatternPDM._uid.value = uid;
            Object.defineProperties(pattern, PatternPDM);
            PatternPDM._uid.value = '';
            return pattern;
        }
    },
    createRadialGradient: {
        enumerable: true,
        value: function (x0, y0, r0, x1, y1, r1) {
            var uid = NCC.uid('pattern');
            rdp(`var ${uid} = ${this._uid}.createRadialGradient(${x0},${y0},${r0},${x1},${y1},${r1})`);
            var radialGradient = (callback) => {
                rdp(callback ? (err, res) => {
                    err ? callback(err, null) : callback(null, radialGradient);
                } : undefined);
                return radialGradient;
            };
            GradientPDM._uid.value = NCC.uid('radialGradient');
            Object.defineProperties(radialGradient, GradientPDM);
            GradientPDM._uid.value = '';
            return radialGradient;
        }
    },
    drawImage: {
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
    fill: {
        enumerable: true,
        value: function () {
            return rdp(`${this._uid}.fill()`);
        }
    },
    fillRect: {
        enumerable: true,
        value: function (x, y, width, height) {
            return rdp(`${this._uid}.fillRect(${x},${y},${width},${height})`);
        }
    },
    fillText: {
        enumerable: true,
        value: function (text, x, y, maxWidth) {
            return rdp(`${this._uid}.fillText('${text}',${Array.prototype.slice.call(arguments, 1).join(',')})`);
        }
    },
    getImageData: {
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
    getLineDash: {
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
    isPointInPath: {
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
    isPointInStroke: {
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
    lineTo: {
        enumerable: true,
        value: function (x, y) {
            return rdp(`${this._uid}.lineTo(${x},${y})`);
        }
    },
    measureText: {
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
    moveTo: {
        enumerable: true,
        value: function (x, y) {
            return rdp(`${this._uid}.moveTo(${x},${y})`);
        }
    },
    putImageData: {
        enumerable: true,
        value: function (imagedata, dx, dy, dirtyX, dirtyY, dirtyWidth, dirtyHeight) {
            return rdp(`var data = [${Array.prototype.slice.call(imagedata.data).join(',')}]; var iD = ${this._uid}.createImageData(${imagedata.width}, ${imagedata.height}); for (var i = 0, l = iD.data.length; i < l; i++) iD.data[i] = +data[i]; ${this._uid}.putImageData(iD, ${Array.prototype.slice.call(arguments, 1).join(',')})`);
        }
    },
    quadraticCurveTo: {
        enumerable: true,
        value: function (cpx, cpy, x, y) {
            return rdp(`${this._uid}.quadraticCurveTo(${cpx},${cpy},${x},${y})`);
        }
    },
    rect: {
        enumerable: true,
        value: function (x, y, width, height) {
            return rdp(`${this._uid}.rect(${x},${y},${width},${height})`);
        }
    },
    restore: {
        enumerable: true,
        value: function () {
            return rdp(`${this._uid}.restore()`);
        }
    },
    rotate: {
        enumerable: true,
        value: function (angle) {
            return rdp(`${this._uid}.rotate(${angle})`);
        }
    },
    save: {
        enumerable: true,
        value: function () {
            return rdp(`${this._uid}.save()`);
        }
    },
    scale: {
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
    setLineDash: {
        enumerable: true,
        value: function (segments) {
            return rdp(`${this._uid}.setLineDash([${segments.join(',')}])`);
        }
    },
    setTransform: {
        enumerable: true,
        value: function (m11, m12, m21, m22, dx, dy) {
            return rdp(`${this._uid}.setTransform(${m11},${m12},${m21},${m22},${dx},${dy})`);
        }
    },
    stroke: {
        enumerable: true,
        value: function () {
            return rdp(`${this._uid}.stroke()`);
        }
    },
    strokeRect: {
        enumerable: true,
        value: function (x, y, w, h) {
            return rdp(`${this._uid}.strokeRect(${x},${y},${w},${h})`);
        }
    },
    strokeText: {
        enumerable: true,
        value: function (text, x, y, maxWidth) {
            rdp(`${this._uid}.strokeText('${text}',${(Array.prototype.slice.call(arguments, 1).join(','))})`);
            return this;
        }
    },
    transform: {
        enumerable: true,
        value: function (m11, m12, m21, m22, dx, dy) {
            return rdp(`${this._uid}.transform(${m11},${m12},${m21},${m22},${dx},${dy})`);
        }
    },
    translate: {
        enumerable: true,
        value: function (x, y) {
            return rdp(`${this._uid}.translate(${x},${y})`);
        }
    }
};
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
            }
            else
                logger.error('"_remote" can only be set to "null"');
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
            }
            else
                logger.error('"_remote" can only be set to "null"');
        }
    },
};
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
            }
            else
                logger.error('"_remote" can only be set to "null"');
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
            var head = regExp_type.exec(this._base64_), type = filename.split('.').pop();
            if (!head || !head[1] || (head[1] != ((type == "jpg") ? "jpeg" : type)))
                if (callback)
                    return callback(`type mismatch ${head ? head[1] : "'unknown'"} !> ${type}`);
                else
                    throw new Error(`type mismatch ${head ? head[1] : "'unknown'"} !> ${type}`);
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
            if (!src || src === '')
                return;
            if (regExp_data.test(src))
                img._base64 = src;
            else if (regExp_http.test(src)) {
                logger.info(`[ncc] loading image from URL: ${src}`);
                http.get(src, function (res) {
                    var data = '';
                    res.setEncoding('base64');
                    if (res.statusCode != 200) {
                        if (img.onerror)
                            return img.onerror(`loading image failed with status ${res.statusCode}`);
                        else
                            logger.error(`loading image failed with status ${res.statusCode}`);
                    }
                    res.on('data', function (chunk) { data += chunk; });
                    res.on('end', function () {
                        img._base64 = `data:${(res.headers["content-type"] || mimeMap[src.split('.').pop()])};base64,${data}`;
                        logger.info('[ncc] loading image from URL completed');
                    });
                }).on('error', this.onerror || function (err) {
                    if (img.onerror)
                        return img.onerror(err);
                    else
                        logger.error(`loading image failed with err ${err}`);
                });
            }
            else {
                logger.info(`[ncc] loading image from FS: ${src}`);
                fs.readFile(src, 'base64', function (err, data) {
                    if (err) {
                        if (img.onerror)
                            img.onerror(err);
                        else
                            logger.error(`loading image failed with err ${err}`);
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
