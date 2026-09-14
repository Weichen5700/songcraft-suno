import {mkdir,writeFile} from 'node:fs/promises';
import {deflateSync} from 'node:zlib';
import {crc32} from '../dist/archive.js';
await mkdir('tests/artifacts',{recursive:true});
const wav=Buffer.alloc(16044);wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(16000,40);
for(let i=0;i<8000;i++)wav.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*220/8000)*1200),44+i*2);
await writeFile('tests/artifacts/驗證音檔.wav',wav);await writeFile('tests/artifacts/損壞.wav','not audio');
function chunk(type,data){const t=Buffer.from(type),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([t,data])));return Buffer.concat([length,t,data,crc]);}
const header=Buffer.alloc(13);header.writeUInt32BE(64,0);header.writeUInt32BE(64,4);header[8]=8;header[9]=2;
const pixels=Buffer.alloc(64*(1+64*3));for(let y=0;y<64;y++)for(let x=0;x<64;x++){const i=y*193+1+x*3;pixels[i]=55;pixels[i+1]=107;pixels[i+2]=122;}
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
await writeFile('tests/artifacts/共用背景.png',png);console.log('測試音檔及背景已建立。');
