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

    type Priorities = Array<{ regex: RegExp, weight: number }>;

    function darwin() {
        const suffixes = ['/Contents/MacOS/Google Chrome Canary', '/Contents/MacOS/Google Chrome'];

        const LSREGISTER = '/System/Library/Frameworks/CoreServices.framework' +
            '/Versions/A/Frameworks/LaunchServices.framework' +
            '/Versions/A/Support/lsregister';

        const installations: Array<string> = [];

        execSync(
            `${LSREGISTER} -dump` +
            ' | grep -i \'google chrome\\( canary\\)\\?.app$\'' +
            ' | awk \'{$1=""; print $0}\'')
            .toString()
            .split(newLineRegex)
            .forEach((inst: string) => {
                suffixes.forEach(suffix => {
                    const execPath = path.join(inst.trim(), suffix);
                    if (canAccess(execPath)) {
                        installations.push(execPath);
                    }
                });
            });

        // Retains one per line to maintain readability.
        // clang-format off
        const priorities: Priorities = [
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
        let installations: Array<string> = [];

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
        executables.forEach((executable: string) => {
            try {
                const chromePath = execFileSync('which', [executable]).toString().split(newLineRegex)[0];

                if (canAccess(chromePath)) {
                    installations.push(chromePath);
                }
            } catch (e) {
                // Not installed.
            }
        });

        if (!installations.length) {
            throw new Error(
                'The environment variable LIGHTHOUSE_CHROMIUM_PATH must be set to ' +
                'executable of a build of Chromium version 54.0 or later.');
        }

        const priorities: Priorities = [
            { regex: /chrome-wrapper$/, weight: 51 }, { regex: /google-chrome-stable$/, weight: 50 },
            { regex: /google-chrome$/, weight: 49 },
            { regex: new RegExp(process.env.LIGHTHOUSE_CHROMIUM_PATH), weight: 100 }
        ];

        return sort(uniq(installations.filter(Boolean)), priorities);
    }

    function win32() {
        const installations: Array<string> = [];
        const suffixes = [
            '\\Google\\Chrome SxS\\Application\\chrome.exe', '\\Google\\Chrome\\Application\\chrome.exe'
        ];
        const prefixes =
            [process.env.LOCALAPPDATA, process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)']];

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

    function sort(installations: Array<string>, priorities: Priorities) {
        const defaultPriority = 10;
        return installations
            // assign priorities
            .map((inst: string) => {
                for (const pair of priorities) {
                    if (pair.regex.test(inst)) {
                        return [inst, pair.weight];
                    }
                }
                return [inst, defaultPriority];
            })
            // sort based on priorities
            .sort((a, b) => (<any>b)[1] - (<any>a)[1])
            // remove priority flag
            .map(pair => pair[0]);
    }

    function canAccess(file: string): Boolean {
        if (!file) {
            return false;
        }

        try {
            fs.accessSync(file);
            return true;
        } catch (e) {
            return false;
        }
    }

    function uniq(arr: Array<any>) {
        return Array.from(new Set(arr));
    }

    function findChromeExecutables(folder: string): Array<string> {
        const argumentsRegex = /(^[^ ]+).*/; // Take everything up to the first space
        const chromeExecRegex = '^Exec=\/.*\/(google|chrome|chromium)-.*';

        let installations: Array<string> = [];
        if (canAccess(folder)) {
            // Output of the grep & print looks like:
            //    /opt/google/chrome/google-chrome --profile-directory
            //    /home/user/Downloads/chrome-linux/chrome-wrapper %U
            let execPaths = execSync(`grep -ER "${chromeExecRegex}" ${folder} | awk -F '=' '{print $2}'`)
                .toString()
                .split(newLineRegex)
                .map((execPath: string) => execPath.replace(argumentsRegex, '$1'));

            execPaths.forEach((execPath: string) => canAccess(execPath) && installations.push(execPath));
        }

        return installations;
    }

    var chromeFinder = {
        darwin: darwin,
        linux: linux,
        win32: win32
    }

    class ChromeLauncher {
        prepared = false;
        pollInterval: number = 500;
        autoSelectChrome: boolean;
        TMP_PROFILE_DIR: string;
        outFile?: number;
        errFile?: number;
        pidFile: string;
        startingUrl: string;
        chromeFlags: Array<string>;
        chrome?: any;
        port: number;

        constructor(opts: {
            startingUrl?: string,
            chromeFlags?: Array<string>,
            autoSelectChrome?: boolean,
            port?: number
        } = {}) {
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
                    const installations = (<any>chromeFinder)[process.platform]();

                    if (installations.length < 1) {
                        return Promise.reject(new Error('No Chrome Installations Found'));
                    } else if (installations.length === 1 || this.autoSelectChrome) {
                        return installations[0];
                    }

                    //return ask('Choose a Chrome installation to use with Lighthouse', installations);
                })
                .then(execPath => this.spawn(execPath));
        }

        spawn(execPath: string) {
            const spawnPromise = new Promise(resolve => {
                if (this.chrome) {
                    console.log('ChromeLauncher', `Chrome already running with pid ${this.chrome.pid}.`);
                    return resolve(this.chrome.pid);
                }

                const chrome = spawn(
                    execPath, this.flags(), { detached: true, stdio: ['ignore', this.outFile, this.errFile] });
                this.chrome = chrome;

                fs.writeFileSync(this.pidFile, chrome.pid.toString());

                console.log('ChromeLauncher', `Chrome running with pid ${chrome.pid} on port ${this.port}.`);
                resolve(chrome.pid);
            });

            return spawnPromise.then(pid => Promise.all([pid, this.waitUntilReady()]));
        }

        cleanup(client?: any) {
            if (client) {
                client.removeAllListeners();
                client.end();
                client.destroy();
                client.unref();
            }
        }

        // resolves if ready, rejects otherwise
        isDebuggerReady(): Promise<{}> {
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
                        } else {
                            process.kill(-this.chrome.pid);
                        }
                    } catch (err) {
                        console.log('ChromeLauncher', `Chrome could not be killed ${err.message}`);
                    }

                    delete this.chrome;
                } else {
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
    };

    function defaults<T>(val: T | undefined, def: T): T {
        return typeof val === 'undefined' ? def : val;
    }

    function delay(time: number) {
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
})()

