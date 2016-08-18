/***
 * Revisions:
 *
 * 8-6-2016:
 * - add pause, forward, reverse
 * - implement slide with volume effect
 *
 * 8-5-2016:
 * - fix invertObject
 * - log first row of each pattern (ooops)
 * - oscillate on note/volume sliding some more
 * - log unimplemented effects on ^C
 * - add channel toggle
 *
 * 8-3-2016:
 * - disable lerping (clicks)
 * - working on volume slide and note sliding
 * - switch to 44.1khz output
 * - take filename in argv
 *
 * 8-2-2016:
 * - add lerping
 * - add stereo separation
 * - fix pattern break bug (wait till end of division to break)
 *
 * 8-1-2016:
 * - samples are 1-offset!
 * - "nifty" UI for showing playback
 * - wow, it actually works?
 * - Hmm, sounds a lot better when converting samples to 32bit floats
 *
 * 7-31-2016:
 * - LOL, starting to play
 * -- much of this was borrowed heavily from https://github.com/jhalme/webaudio-mod-player
 * -- does not work very well
 * - integrates 'speaker' module for audio output
 *
 * 7-29-2016:
 * - parse effects/params
 * - loads sample data
 * - fixes sample length etc to be in words
 *
 * 7-20-2016:
 * - parses classic MOD files
 * -- except details of effects and sample data
 * - only works in node
 *
 * TODO:
 * - needs a lowpass filter like something else
 * - effects?
 * - make this work in a browser
 * - tests, lol
 ***/

"use strict";

const unimplemented = {extended: {}};

function rightPad(string, len) {
    while (string.length < len) {
        string += " ";
    }
    return string.slice(0, len);
}

function arrayToString(typedArray) {
    let str = "";
    for (let i = 0; i < typedArray.length; i++) {
        if (typedArray[i] == 0) {
            break;
        }
        str += String.fromCharCode(typedArray[i]);
    }
    return str;
}

function invertObject(obj) {
    return Object.keys(obj).reduce((o, k) => { o[obj[k]] = k; return o; }, {});
}

function clamp(val, min, max) {
    return Math.min(Math.max(val, min), max);
}

class Module {
    constructor(name) {
        this.name = name;
        this.channels = Module.NUM_CHANNELS;
        this.samples = [];
        this.patterns = [];
        this.patternTable = [];
    }
}

Module.FILENAME_LENGTH = 20;

// TODO: this depends on the file type
Module.NUM_SAMPLES = 31;
Module.NUM_CHANNELS = 4;

Module.fromBuffer = function(buffer) {
    const nameArray = new Uint8Array(buffer, 0, Module.FILENAME_LENGTH - 1);
    const module = new Module(arrayToString(nameArray));

    let offset = 20;
    for (let i = 0; i < Module.NUM_SAMPLES; i++) {
        const sampleBuffer = buffer.slice(offset, offset + Sample.SIZE_IN_BYTES);
        const sample = Sample.fromBuffer(sampleBuffer);
        if (sample) {
            module.samples.push(sample);
        }

        offset += Sample.SIZE_IN_BYTES;
    }

    const numPatternEntries = buffer.readUInt8(offset++);
    const ignore = buffer.readUInt8(offset++);
    module.patternTable = new Uint8Array(buffer.slice(offset, offset + numPatternEntries));

    const numPatterns = module.patternTable.reduce((max, pId) => pId > max ? pId : max, 0);

    offset += 128;

    // TODO: determine number of channels from signature
    offset += 4;

    for (let i = 0; i <= numPatterns; i++) {
        const patternBuffer = buffer.slice(offset, offset + Pattern.SIZE_IN_BYTES);
        const pattern = Pattern.fromBuffer(patternBuffer);
        module.patterns.push(pattern);
        offset += Pattern.SIZE_IN_BYTES;
    }

    module.samples.forEach(sample => {
        const inBuffer = buffer.slice(offset, offset + sample.length);
        sample.buffer = new Float32Array(sample.length);
        for (let i = 0; i < sample.length; i++) {
            const amplitude = inBuffer[i];
            if (amplitude < 128) {
                sample.buffer[i] = amplitude / 128.0;
            } else {
                sample.buffer[i] = (amplitude - 128.0) / 128.0 - 1.0;
            }
        }
        offset += sample.length;
    });

    return module;
}

class Sample {
    constructor(name, length, fineTune, volume, repeatOffset, repeatLength) {
        this.name = name;
        this.length = length;
        this.fineTune = fineTune;
        this.volume = volume;
        this.repeatOffset = repeatOffset;
        this.repeatLength = repeatLength;
    }

    toString() {
        if (this.length == 0) {
            return '<empty>';
        }
        return `${this.name}[${this.length}${this.repeatLength == 2 ? '' : `::${this.repeatOffset}:${this.repeatLength}`}]`;
    }
}

Sample.NAME_LENGTH = 22;
Sample.SIZE_IN_BYTES = 30;

Sample.fromBuffer = function(sampleBuffer) {
    const offset = sampleBuffer.byteOffset;
    const nameArray = new Uint8Array(sampleBuffer, 0, Sample.NAME_LENGTH);
    const length = sampleBuffer.readUInt16BE(22) * 2; // sample length is in *words*
    const fineTune = sampleBuffer.readUInt8(24) & 0x0f;
    const volume = sampleBuffer.readUInt8(25) / 64.0;
    const repeatOffset = sampleBuffer.readUInt16BE(26) * 2;
    let repeatLength = sampleBuffer.readUInt16BE(28) * 2;
    if (repeatLength === 2) {
        repeatLength = 0;
    }
    if (length > 0) {
        return new Sample(arrayToString(nameArray), length, fineTune, volume, repeatOffset, repeatLength);
    }
}

class Pattern {
    constructor(channels) {
        this.channels = channels;
        // bleh?
    }

    toString() {

    }
}

Pattern.fromBuffer = function(buffer) {
    const channels = [0,1,2,3].map(_ => []);

    let offset = 0;
    for (let i = 0; i < 64; i++) {
        const position0 = buffer.readUInt32BE(offset + 0);
        const position1 = buffer.readUInt32BE(offset + 4);
        const position2 = buffer.readUInt32BE(offset + 8);
        const position3 = buffer.readUInt32BE(offset + 12);

        channels[0].push(Note.fromUInt32(position0));
        channels[1].push(Note.fromUInt32(position1));
        channels[2].push(Note.fromUInt32(position2));
        channels[3].push(Note.fromUInt32(position3));

        offset += 16;
    }

    return new Pattern(channels);
}

Pattern.SIZE_IN_BYTES = 1024;

class Note {
    constructor(sample, period, effect) {
        this.sample = sample;
        this.period = period;
        this.effect = effect;
    }

    toString() {
        return `s[${this.sample}]p[${this.period}]e[${this.effect}]`;
    }
}

Note.fromUInt32 = function(uint32) {
    const sample = ((uint32 & 0xf0000000) >> 24) | ((uint32 & 0xf000) >> 12);
    const period = (uint32 & 0x0fff0000) >> 16;
    const effect = Effect.fromUInt16(uint32 & 0x0fff);

    return new Note(sample, period, effect);
}

class Effect {
    constructor(type, arg1, arg2) {
        this.type = type;
        this.arg1 = arg1;
        this.arg2 = arg2;
    }

    isNonNull() {
        return this.type | this.arg1 | this.arg2;
    }

    toString() {
        if (!this.isNonNull()) {
            return '';
        }
        else if (this.type != Effect.TYPES.EXTENDED) {
            const type = Effect.TYPES_INVERSE[this.arg1];
            return `${this.type}[${this.arg1}:${this.arg2}]`;
        } else {
            const type = Effect.EXTENDED_TYPES_INVERSE[this.arg2];
            return `${this.type}[${this.arg1}:${this.arg2}]`;
        }
    }

    get combinedValue() {
        return this.arg1 * 16 + this.arg2;
    }
}

Effect.TYPES = {
    ARPEGGIO:                0,
    SLIDE_UP:                1,
    SLIDE_DOWN:              2,
    SLIDE_TO_NOTE:           3,
    VIBRATO:                 4,
    SLIDE_WITH_VOLUME:       5,
    VIBRATO_WITH_VOLUME:     6,
    TREMOLO:                 7,
    UNUSED:                  8,
    SET_SAMPLE_OFFSET:       9,
    VOLUME_SLIDE:           10,
    POSITION_JUMP:          11,
    SET_VOLUME:             12,
    PATTERN_BREAK:          13,
    EXTENDED:               14,
    SET_SPEED:              15,
};
Effect.TYPES_INVERSE = invertObject(Effect.TYPES);
Effect.EXTENDED_TYPES = {
    FILTER_TOGGLE:           0,
    FINESLIDE_UP:            1,
    FINESLIDE_DOWN:          2,
    GLISSANDO_TOGGLE:        3,
    SET_VIBRATO_WAVEFORM:    4,
    SET_FINETUNE:            5,
    LOOP_PATTERN:            6,
    SET_TREMOLO_WAVEFORM:    7,
    UNUSED:                  8,
    RETRIGGER_SAMPLE:        9,
    FINE_VOLUME_SLIDE_UP:   10,
    FINE_VOLUME_SLIDE_DOWN: 11,
    CUT_SAMPLE:             12,
    DELAY_SAMPLE:           13,
    DELAY_PATTERN:          14,
    INVERT_LOOP:            15,
};
Effect.EXTENDED_TYPES_INVERSE = invertObject(Effect.EXTENDED_TYPES);

Effect.fromUInt16 = function(uint16) {
    const type = (uint16 & 0x0f00) >> 8;
    const arg1 = (uint16 & 0x00f0) >> 4;
    const arg2 = uint16 & 0x000f;

    return new Effect(type, arg1, arg2);
}

class Player {
    constructor(module) {
        this.module = module;
        this.sampleRate = 44100;
        this.bpm = 125;
        this.speed = 6;
        this.tick = 0;
        this.offset = 0;
        this.position = 0;
        this.row = 0;
        this.channels = []
        this.state = {
            endOfSong: false,
            patternBreak: false,
            paused: false,
            newPattern: true,
            newRow: true,
            newTick: true,
        };
        for (let i = 0; i < module.channels; i++) {
            this.channels.push({
                noteOn: false,
                sample: 0,
                samplePos: 0,
                period: 214,
                volume: 1, // 64
                disabled: false,
            });
        }
    }

    toggleChannel(channel) {
        if (this.channels[channel]) {
            this.channels[channel].disabled = !this.channels[channel].disabled;
            console.log("dis/enabling channel", channel, this.channels[channel].disabled);
        }
    }

    reverse() {
        if (this.tick == 0) {
            this.position--;
        }
        if (this.position < 0) {
            this.position = 0;
        }
        this._reset();
    }

    forward() {
        if (this.position == this.module.patternTable.length - 1) {
            this.state.endOfSong = true;
        } else {
            this.position++;
        }
        this._reset();
    }

    pause() {
        this.state.paused = !this.state.paused;
    }

    _reset() {
        this.row = 0;
        this.tick = 0;
        this.offset = 0;
        Object.assign(this.state, {
            newPattern: true,
            newRow: true,
            newTick: true,
        });
    }

    advance() {
        const speed = (((this.sampleRate * 60) / this.bpm) / 4) / this.speed;

        if (this.state.newPattern) {
            console.log("Position: ", this.position, "Pattern: ", this.module.patternTable[this.position]);
            this.state.newPattern = false;
        }

        if (this.state.newRow) {
            const pattern = this.module.patterns[this.module.patternTable[this.position]];
            if (pattern) {
                const row = pattern.channels.map((c, i) => rightPad(this.channels[i].disabled ? 'xxx' : c[this.row].toString(), 21));
                console.log(((this.row < 10) ? (' ' + this.row) : this.row) + ' ' + row.join(" | "));
            }
        }

        if (this.offset > speed) {
            this.state.newTick = true;
            this.tick++;
            this.offset=0;
        } else {
            this.state.newTick = false;
        }

        if (this.tick > this.speed) {
            this.row++;
            this.tick = 0;
            this.state.newRow = true;
        } else {
            this.state.newRow = false;
        }

        if (this.row >= 64) {
            this.position++;
            this.row = 0;
            this.state.newRow = true;
            this.state.newPattern = true;
        }

        if (this.state.newRow) {
            if (this.state.patternBreak) {
                this.position++;
                this.tick = 0;
                this.row = 0;
                this.offset = 0;
                this.state.newPattern = true;
                this.state.patternBreak = false;
            }
        }

        if (this.position >= this.module.patternTable.length) {
            this.state.endOfSong = true;
        }
    }

    mix(buffer) {
        for (let i = 0; i < buffer.length; i+=2) {
            let output = [0.0, 0.0];

            if (!this.state.endOfSong && !this.state.paused) {
                const pattern = this.module.patterns[this.module.patternTable[this.position]];

                for (let channel = 0; channel < this.module.channels; channel++) {
                    const note = pattern.channels[channel][this.row];
                    const curChannel = this.channels[channel];
                    if (this.state.newRow) {
                        if (note.sample != 0) {
                            curChannel.noteOn = true;
                            curChannel.sample = note.sample - 1;
                            curChannel.volume = this.module.samples[curChannel.sample].volume;
                            curChannel.samplePos = 0;
                        }
                        if (note.period != 0) {
                            curChannel.noteOn = true;
                            curChannel.period = note.period;
                            curChannel.sampleSpeed = 7093789.2/(curChannel.period*2) / this.sampleRate;
                        }
                    }

                    if (note.effect.isNonNull()) {
                        let sliding = false;

                        if (note.effect.type === Effect.TYPES.PATTERN_BREAK) {
                            this.state.patternBreak = true;
                        }

                        if (this.state.newRow) {
                            const effect = note.effect;
                            switch (effect.type) {
                                case Effect.TYPES.PATTERN_BREAK:
                                    this.state.patternBreak = true;
                                    break;

                                case Effect.TYPES.SLIDE_UP:
                                    curChannel.slidePeriod = -effect.combinedValue;
                                    break;

                                case Effect.TYPES.SLIDE_DOWN:
                                    curChannel.slidePeriod = effect.combinedValue;
                                    break;

                                case Effect.TYPES.SLIDE_TO_NOTE:
                                    // need to cancel this somehow
                                    if (effect.combinedValue != 0 ) {
                                        curChannel.slideToSpeed = effect.combinedValue;
                                    }
                                    curChannel.slideTo = note.period;
                                    sliding = true;
                                    break;

                                case Effect.TYPES.SLIDE_WITH_VOLUME:
                                    sliding = true;
                                    if (effect.arg1) {
                                        curChannel.volumeSlide = effect.arg1 / 64.0;
                                    } else {
                                        curChannel.volumeSlide = -effect.arg2 / 64.0;
                                    }
                                    break;

                                case Effect.TYPES.VOLUME_SLIDE:
                                    if (effect.arg1) {
                                        curChannel.volumeSlide = effect.arg1 / 64.0;
                                    } else {
                                        curChannel.volumeSlide = -effect.arg2 / 64.0;
                                    }
                                    break;

                                case Effect.TYPES.SET_VOLUME:
                                    curChannel.volume = effect.combinedValue / 64.0;
                                    break;

                                case Effect.TYPES.SET_SPEED:
                                    const speed = effect.combinedValue;
                                    if (speed <= 32) {
                                        this.speed = speed;
                                    } else {
                                        this.bpm = speed;
                                    }
                                    break;

                                default:
                                    unimplemented[effect.type] = Effect.TYPES_INVERSE[effect.type];
                                    if (effect.type == Effect.TYPES.EXTENDED) {
                                        unimplemented['extended'][effect.arg1] = Effect.EXTENDED_TYPES_INVERSE[effect.arg1];
                                    }
                            }
                            if (!sliding) {
                                curChannel.slideTo = note.period;
                                curChannel.slideToSpeed = 0;
                                curChannel.slidePeriod = 0;
                            }
                        } else if (this.state.newTick) {
                            if (curChannel.slidePeriod) {
                                let newPeriod = curChannel.period + curChannel.slidePeriod;
                                if (newPeriod < 113) {
                                    newPeriod = 113;
                                    curChannel.slidePeriod = 0;
                                } else if (newPeriod > 856) {
                                    newPeriod = 856;
                                    curChannel.slidePeriod = 0;
                                }
                                curChannel.period = newPeriod;
                                curChannel.recalcSpeed = true;
                            }

                            if (curChannel.slideToSpeed) {
                                if (curChannel.period < curChannel.slideTo) {
                                    curChannel.period += curChannel.slideToSpeed;
                                    if (curChannel.period > curChannel.slideTo) {
                                        curChannel.period = curChannel.slideTo;
                                    }
                                    curChannel.recalcSpeed = true;
                                } else if (curChannel.period > curChannel.slideTo) {
                                    curChannel.period -= curChannel.slideToSpeed;
                                    if (curChannel.period < curChannel.slideTo) {
                                        curChannel.period = curChannel.slideTo;
                                    }
                                    curChannel.recalcSpeed = true;
                                }
                            }

                            if (curChannel.volumeSlide) {
                                curChannel.volume += curChannel.volumeSlide;
                                curChannel.volume = clamp(curChannel.volume + curChannel.volumeSlide, 0, 1);
                                curChannel.volumeSlide = 0;
                            }
                        }
                    }

                    let channelOutput = 0;
                    if (curChannel.noteOn && !curChannel.disabled) {
                        if (curChannel.recalcSpeed) {
                            curChannel.sampleSpeed = 7093789.2/(curChannel.period*2) / this.sampleRate;
                            curChannel.recalcSpeed = false;
                        }
                        const sample = this.module.samples[curChannel.sample];
                        curChannel.samplePos += curChannel.sampleSpeed;
                        let generatesOutput = false;
                        if (sample.repeatLength > 0) {
                            if (curChannel.samplePos > sample.repeatOffset + sample.repeatLength) {
                                curChannel.samplePos -= sample.repeatLength;
                            }
                            generatesOutput = true;
                        } else {
                            if (curChannel.samplePos < sample.length) {
                                generatesOutput = true;
                            } else {
                                curChannel.noteOn = false;
                            }
                        }
                        if (generatesOutput) {
                            let samplePos = Math.floor(curChannel.samplePos);
                            channelOutput = sample.buffer[samplePos] * curChannel.volume;
                        }
                    }
                    output[channel & 0x1] += channelOutput;
                }
            }
            buffer[i] = clamp(output[0] * 0.4 + output[1] * 0.1, -1.0, 1.0);
            buffer[i+1] = clamp(output[1] * 0.4 + output[0] * 0.1, -1.0, 1.0);
            this.offset++;
            if (!this.state.paused) {
                this.advance();
            }
        }
    }
}

module.exports = {Module, Sample, Pattern, Note, Effect, Player};
