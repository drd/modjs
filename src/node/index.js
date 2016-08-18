"use strict";

const fs = require('fs');
const Readable = require('stream').Readable;

const keypress = require('keypress');
const Speaker = require('speaker');

const Mod = require('../shared/mod');
const Player = Mod.Player;
const Module = Mod.Module;

function test() {
    const filename = process.argv.length > 2 ? process.argv[2] : 'airwolf.mod';
    const buffer = fs.readFileSync(filename);
    const module = Module.fromBuffer(buffer);
    const format = {
        channels: 2,
        bitDepth: 32,
        float: true,
        interleaved: true,

        sampleRate: 44100,
    };
    const speaker = new Speaker(format);

    const player = new Player(module);
    keypress(process.stdin);
    process.stdin.on('keypress', function(ch, key) {
        const keyAsInt = parseInt(ch);
        if (!isNaN(keyAsInt)) {
            player.toggleChannel(keyAsInt);
        }
        switch (key && key.name) {
            case 'left':
                player.reverse();
                break;
            case 'right':
                player.forward();
                break;
            case 'space':
                player.pause();
                break;
        }
        if (key && key.ctrl && key.name == 'c') {
            console.log(unimplemented);
            process.exit(0)
        }
    });
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const util = require('audio-buffer-utils');
    const pcm = require('pcm-util');

    class ModReadable extends Readable {
        _read(size) {
            console.time('mix');
            const outBuffer = new Float32Array(size * 2);
            player.mix(outBuffer);
            const bytes = new Buffer(size * 4);
            for (let i = 0; i < size; i++) {
                bytes.writeFloatLE(outBuffer[i], i * 4);
            }
            this.push(bytes);
            if (player.endOfSong) {
                this.push(null);
            }
            console.timeEnd('mix');
        }
    };
    const playerReadable = new ModReadable();

    playerReadable.pipe(speaker);
}

process.on('SIGINT', function() {
    console.log(unimplemented);
    process.exit(0);
});
test();
