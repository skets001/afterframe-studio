import { build as buildScript } from 'esbuild';
import { build } from 'vite';
import { mkdir, writeFile, copyFile } from 'node:fs/promises';
const metadata = `// ==UserScript==
// @name         Afterframe — Gemini phone engine
// @namespace    https://github.com/skets001/afterframe-studio
// @version      0.1.0
// @description  Pair your own Gemini browser with Afterframe to prepare living-painting videos. Experimental UI automation with visible controls.
// @match        https://gemini.google.com/*
// @run-at       document-idle
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.deleteValue
// @grant        GM.xmlHttpRequest
// @connect      googleusercontent.com
// @connect      googlevideo.com
// @connect      google.com
// @connect      storage.googleapis.com
// @license      MIT
// ==/UserScript==`;
await mkdir('public',{recursive:true});
await copyFile('src/viewer.js','public/viewer-runtime.js');
await buildScript({entryPoints:['src/userscript.js'],bundle:true,format:'iife',platform:'browser',target:['firefox120'],outfile:'public/afterframe.user.js',banner:{js:metadata},legalComments:'inline'});
await writeFile('public/.nojekyll','');
await build();
