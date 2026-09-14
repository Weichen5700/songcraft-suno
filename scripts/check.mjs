import { readdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { makeZip } from '../dist/archive.js';
const files=['server.mjs'];
for(const dir of ['dist','extension','scripts','tests']) for(const f of await readdir(dir)) if(/\.(m?js)$/.test(f)) files.push(`${dir}/${f}`);
for(const file of files){const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(result.status!==0)throw new Error(`${file}: ${result.stderr}`);}
const manifest=JSON.parse(await readFile('extension/manifest.json','utf8'));
if(manifest.manifest_version!==3||manifest.host_permissions)throw new Error('擴充套件權限異常');
const entries=[];for(const name of await readdir('extension'))entries.push({name,data:new Uint8Array(await readFile(`extension/${name}`))});
await writeFile('dist/suno-helper.zip',new Uint8Array(await (await makeZip(entries)).arrayBuffer()));
console.log(`語法檢查通過：${files.length} 個檔案；擴充套件 ZIP 已更新。`);
