const base64 = require('base64-js');
import React from 'react';
import ReactDOM from 'react-dom';

const {Module, Player} = require('../shared/mod');

import App from './ui/app';

function test() {
    const file = require('../../overload.mod');
    const byteArray = base64.toByteArray(file);
    const buffer = Buffer.from(byteArray);
    const module = Module.fromBuffer(buffer);
    const player = new Player(module);

    var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    var audioProcessor = audioCtx.createScriptProcessor(1024, 2, 2);
    var filterNode = audioCtx.createBiquadFilter();
    var compressorNode = audioCtx.createDynamicsCompressor();
    filterNode.frequency.value=6000;

    const root = document.createElement('div');
    document.body.appendChild(root);

    var outBuffer = new Float32Array(1024 * 2);
    audioProcessor.onaudioprocess = function(evt) {
        player.mix(outBuffer);
        const audioBuffer = evt.outputBuffer;
        const left = audioBuffer.getChannelData(0);
        const right = audioBuffer.getChannelData(1);
        for (let i = 0; i < 1024; i++) {
            left[i] = outBuffer[i * 2];
            right[i] = outBuffer[i * 2 + 1];
        }
        if (player.endOfSong) {
            audioProcessor.disconnect(audioCtx.destination);
        }
        ReactDOM.render(
            <App player={player} module={module} output={outBuffer} />,
            root
        );
    };

    audioProcessor.connect(filterNode);
    filterNode.connect(compressorNode);
    compressorNode.connect(audioCtx.destination);


    setTimeout(() => {
        ReactDOM.render(
            <App player={player} module={module} />,
            root
        );
    }, 100)
}

test();
