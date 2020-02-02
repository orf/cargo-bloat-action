module.exports =
/******/ (function(modules, runtime) { // webpackBootstrap
/******/ 	"use strict";
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId]) {
/******/ 			return installedModules[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.l = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	__webpack_require__.ab = __dirname + "/";
/******/
/******/ 	// the startup function
/******/ 	function startup() {
/******/ 		// Load entry module and return exports
/******/ 		return __webpack_require__(198);
/******/ 	};
/******/
/******/ 	// run startup
/******/ 	return startup();
/******/ })
/************************************************************************/
/******/ ({

/***/ 198:
/***/ (function() {

System.register(["@actions/core", "@actions/github", "./snapshots", "./bloat", "./comments"], function (exports_1, context_1) {
    "use strict";
    var core, github, snapshots_1, bloat_1, comments_1, ALLOWED_EVENTS;
    var __moduleName = context_1 && context_1.id;
    async function run() {
        if (!ALLOWED_EVENTS.includes(github.context.eventName)) {
            core.setFailed(`This can only be used with the following events: ${ALLOWED_EVENTS.join(', ')}`);
            return;
        }
        await core.group('Installing cargo-bloat', async () => {
            await bloat_1.installCargoBloat();
        });
        const versions = await core.group('Toolchain info', async () => {
            return bloat_1.getToolchainVersions();
        });
        const bloatData = await core.group('Running cargo-bloat', async () => {
            return await bloat_1.runCargoBloat();
        });
        const repo_path = `${github.context.repo.owner}/${github.context.repo.repo}`;
        const currentSnapshot = {
            commit: github.context.sha,
            crates: bloatData.crates,
            file_size: bloatData['file-size'],
            text_section_size: bloatData['text-section-size'],
            toolchain: versions.toolchain,
            rustc: versions.rustc,
            bloat: versions.bloat
        };
        if (github.context.eventName == 'push') {
            // Record the results
            return await core.group('Recording', async () => {
                return await snapshots_1.recordSnapshot(repo_path, currentSnapshot);
            });
        }
        // A merge request
        const masterSnapshot = await core.group('Fetching last build', async () => {
            return await snapshots_1.fetchSnapshot(repo_path, versions.toolchain);
        });
        await core.group('Posting comment', async () => {
            const snapshotDiff = snapshots_1.compareSnapshots(currentSnapshot, masterSnapshot);
            core.debug(`snapshot: ${JSON.stringify(snapshotDiff, undefined, 2)}`);
            await comments_1.createOrUpdateComment(versions.toolchain, comments_1.createSnapshotComment(versions.toolchain, snapshotDiff));
        });
    }
    async function main() {
        try {
            await run();
        }
        catch (error) {
            core.setFailed(error.message);
        }
    }
    return {
        setters: [
            function (core_1) {
                core = core_1;
            },
            function (github_1) {
                github = github_1;
            },
            function (snapshots_1_1) {
                snapshots_1 = snapshots_1_1;
            },
            function (bloat_1_1) {
                bloat_1 = bloat_1_1;
            },
            function (comments_1_1) {
                comments_1 = comments_1_1;
            }
        ],
        execute: function () {
            ALLOWED_EVENTS = ['pull_request', 'push'];
            main();
        }
    };
});


/***/ })

/******/ });