var fs = require('fs')

class MidiEvent
{
    constructor()
    {
        this.type = '';
        this.time = 0;
        this.data = undefined;
        this.size = 0;
        this.statusByte = 0x00;
    }
}

class Song
{
    constructor(options)
    {
        this.events = [];
        this.bpm = 120;
        this.ppq = 480;
        this.noteCallback = undefined;
        this.metaCallback = undefined;
        this.voiceCallback = undefined;
        this.format = 0;
        this.tracks = [];

        for (var prop in options)
        {
            if (this.hasOwnProperty(prop))
                this[prop] = options[prop];
        }
    
        this._nextEvent = undefined;
        this._nextEventIndex = 0;
        this._eventTimer = 0;
        this._msPerTick = (1000 / this.ppq) * (this.bpm / 60);
        this._active = false;
        this._interval = undefined;
        this._processing = false;
        this._activeTrack = 0;
        this.paused = true;
        this.lastTick = Date.now();

        if (this.noteCallback == undefined) this.noteCallback = (d) => {};
        if (this.metaCallback == undefined) this.metaCallback = (d) => {};
        if (this.voiceCallback == undefined) this.voiceCallback = (d) => {};
    }

    play(track)
    {
        this._activeTrack = track;
        if (this._interval === undefined)
        {
            this._interval = setInterval(this._tick.bind(this), this._msPerTick);
        }

        this._active = true;
        this.paused = false;
        this._processing = false;
    }

    pause()
    {
        if (this._interval !== undefined)
        {
            clearInterval(this._interval);
            this._interval = undefined;
        }

        this.paused = true;
        this._processing = false;
    }

    stop()
    {
        this.pause();
        this._nextEvent = undefined;
        this._nextEventIndex = 0;
        this._eventTimer = 0;
        this._active = false;
        this._processing = false;
    }

    setUsPerBeat(usPerBeat)
    {
        if (this._active)
            this.pause();

        var msPerBeat = usPerBeat / 1000;
        this.bpm = Math.round((1 / msPerBeat) * 60000);
        this._msPerTick = Math.round((1 / this.ppq) * msPerBeat);

        if (this._active)
            this.play(this._activeTrack);
    }

    setBpm(bpm)
    {
        if (this._active)
            this.pause();
        
        this.bpm = bpm;
        this._msPerTick = (1000 / this.ppq) * (this.bpm / 60);

        if (this._active)
            this.play(this._activeTrack);
    }

    setFps(fps)
    {
        var msPerFrame = 1000 / fps;
        var msDiff = this._msPerTick / msPerFrame;

        this.events.forEach((eventList, i) => {
            eventList.forEach((evt, j) => {
                evt.time = (msDiff * evt.time) | 0;
            });
        });

        this._msPerTick = msPerFrame;
        this.ppq *= msDiff;
    }

    _tick()
    {
        // Lock it down to handle ticks taking too long to process
        if (!this._processing)
        {
            this._eventTimer++;
            this._processing = true;

            this._nextEvent = this.events[this._activeTrack][this._nextEventIndex];
            
            while (this._nextEvent !== undefined)
            {
                if (this._eventTimer >= this._nextEvent.time)
                {
                    switch (this._nextEvent.type)
                    {
                        case 'note':
                            this.noteCallback(this._nextEvent.data);
                            break;
                        case 'meta':
                            this.metaCallback(this._nextEvent.data);
                            break;
                        case 'tempo':
                            this.setUsPerBeat(this._nextEvent.data.usPerBeat);
                            break;
                        case 'voice':
                            this.voiceCallback(this._nextEvent.data);
                            break;
                        default:
                            break;
                    }

                    this._eventTimer = 0;
                    this._nextEventIndex = (this._nextEventIndex + 1) % this.events[this._activeTrack].length;

                    this._nextEvent = this.events[this._activeTrack][this._nextEventIndex];
                    if (this._nextEvent.time > 0)
                        this._nextEvent = undefined;
                } else {
                    this._nextEvent = undefined;
                }
            }

            this._processing = false;
        }
    }

    arpeggioize(arpeggioTicks) {
        this.tracks.forEach((track, i) => {
            if (!track.dataOnly) {
                var eventList = this.events[i];
                for (var j = 0; j < eventList.length - 1; j++)
                {
                    var evt = eventList[j];
                    if (evt.type == 'note' && evt.data.event == 'on') {
                        // TRY TO DETECT A CHORD
                        var next = eventList[j + 1];
                        var chord = [];
                        chord.push(evt);
                        while (next.type == 'note' && next.data.event == 'on' && next.time == 0)
                        {
                            chord.push(next);
                            eventList.splice(j + 1, 1);

                            if (j + 1 >= eventList.length) break;

                            next = eventList[j + 1];
                        }

                        var addedNotes = 0;
                        if (chord.length > 1 && next.time > 0)
                        {
                            // CHORD
                            var dt = next.time - evt.time;
                            var steps = (dt / arpeggioTicks) | 0;
                            for (var step = 1; step <= steps; step++)
                            {
                                var oldNote = chord[(step - 1) % chord.length];
                                var noteOffEvt = new MidiEvent();
                                noteOffEvt.size = oldNote.size;
                                noteOffEvt.statusByte = oldNote.statusByte;
                                noteOffEvt.type = oldNote.type;
                                noteOffEvt.data = {
                                    event: 'off',
                                    note: oldNote.data.note,
                                    velocity: 0
                                };
                                noteOffEvt.time = arpeggioTicks;

                                eventList.splice(j + (2 * step) - 1, noteOffEvt);
                                addedNotes++;

                                if (step < steps) {
                                    var note = chord[step % chord.length];
                                    var noteEvt = new MidiEvent();
                                    noteEvt.size= note.size;
                                    noteEvt.statusByte = note.statusByte;
                                    noteEvt.type = note.type;
                                    noteEvt.data = note.data;
                                    noteEvt.time = arpeggioTicks;

                                    eventList.splice(j + (2 * step), noteEvt);
                                    addedNotes++;
                                }
                            }
                        }
                        j += addedNotes;
                    }
                }
                this.events[i] = eventList;
            }
        });
    }
}

class Chunk
{
    constructor()
    {
        this.type = '';
        this.size = 0;
        this.data = undefined;
        this.isGarbage = false;
    }

    static Read(file)
    {
        var chunk = new Chunk();
        var buffer = Buffer.alloc(4, 0x00);
        var bytesRead = 0;

        bytesRead = fs.readSync(file, buffer, 0, 4);
        chunk.type = buffer.toString('ascii');

        if (bytesRead < 4)
            chunk.isGarbage = true;
        
        bytesRead = fs.readSync(file, buffer, 0, 4);
        chunk.size = buffer.readUIntBE(0, 4);

        if (bytesRead < 4)
            chunk.isGarbage = true;

        bytesRead = chunk.data = Buffer.alloc(chunk.size, 0x00);
        fs.readSync(file, chunk.data, 0, chunk.size);

        if (bytesRead < chunk.size)
            chunk.isGarbage = true;

        return chunk;
    }

    static Find(arr, name)
    {
        for (var i = 0; i < arr.length; i++)
        {
            if (arr[i].type == name)
                return arr[i];
        }

        return undefined;
    }

    static FindAll(arr, name)
    {
        var chunks = [];
        for (var i = 0; i < arr.length; i++)
        {
            if (arr[i].type == name)
                chunks.push(arr[i]);
        }

        return chunks;
    }
}

function readHead(chunk, song)
{
    var format = chunk.data.readUIntBE(0, 2);
    var tracks = chunk.data.readUIntBE(2, 2);
    var division = chunk.data.readUIntBE(4, 2);

    if ((0x80 & division) == 0x80)
        return false;
    
    song.format = format;
    song.tracks = [];
    for (var i = 0; i < tracks; i++)
    {
        song.tracks.push({
            name: '',
            instrument: 'Any Instrument',
            dataOnly: true
        });
    }
    
    song.ppq = division;

    song.setBpm(song.bpm);
    
    return true;
}

function readVariableInt(buffer, offset)
{
    var num = 0x00;
    var size = 0;
    var continueReading = false;
    do
    {
        var b = buffer.readUIntBE(offset + size, 1);
        num = (num << 7) | (b & 0xEF);
        size++;

        continueReading = (b & 0x80) == 0x80;
    } while (continueReading);

    return { value: num, size: size };
}

function readEvent(buffer, offset, lastEvent)
{
    var evt = new MidiEvent();
    evt.type = 'undefined';

    var deltaTime = readVariableInt(buffer, offset);
    evt.size += deltaTime.size;
    evt.time = deltaTime.value;

    var runningStatus = false;
    var eventType = 0x00;
    if (lastEvent !== undefined && (lastEvent.statusByte & 0xF0) != 0xF0) {
        // Attempt to handle running status
        var evtStatus = buffer.readUIntBE(offset + evt.size, 1);
        if (evtStatus < 0x80) {
            runningStatus = true;
            eventType = lastEvent.statusByte;
            evt.statusByte = lastEvent.statusByte;
        }
    }

    if (!runningStatus) {

        if (evt.size + offset >= buffer.length) {
            return evt;
        }

        eventType = buffer.readUIntBE(offset + evt.size, 1);
        evt.statusByte = eventType;
        evt.size++;

        if (evt.size + offset >= buffer.length) {
            return evt;
        }
    }

    if (eventType == 0xF0 || eventType == 0xF7)
    {
        evt.type = 'sysex:' + (eventType == 0xF0 ? 'F0' : 'F7');

        var length = readVariableInt(buffer, offset + evt.size);
        evt.size += length.size;

        if (evt.size + offset >= buffer.length) {
            return evt;
        }

        evt.data = Buffer.alloc(length.value);
        buffer.copy(evt.data, 0, offset + evt.size, offset + evt.size + length.value);

        evt.size += length.value;

        if (evt.size + offset >= buffer.length) {
            return evt;
        }
    }
    else if (eventType == 0xFF)
    {
        var metaType = buffer.readUIntBE(offset + evt.size, 1);
        evt.size++;

        if (evt.size + offset >= buffer.length) {
            return evt;
        }

        var length = readVariableInt(buffer, offset + evt.size);
        evt.size += length.size;

        if (evt.size + offset >= buffer.length) {
            return evt;
        }

        if (metaType == 0x51)
        {
            evt.type = 'tempo';

            var usPerBeat = buffer.readUIntBE(offset + evt.size, 3);
            evt.data = {
                usPerBeat: usPerBeat
            };
        }
        else if (metaType == 0x03)
        {
            evt.type = 'name';
            evt.data = buffer.toString('ascii', offset + evt.size, offset + evt.size + length.value);
        }
        else if (metaType == 0x04)
        {
            evt.type = 'instrument_name';
            evt.data = buffer.toString('ascii', offset + evt.size, offset + evt.size + length.value);
        }
        else
        {
            evt.type = 'meta';
            evt.data = {
                data: Buffer.alloc(length.value),
                type: metaType
            };

            buffer.copy(evt.data.data, 0, offset + evt.size, offset + evt.size + length.value);
        }

        evt.size += length.value;

        if (evt.size + offset >= buffer.length) {
            return evt;
        }
    }
    else
    {
        var data = [];
        data.push(buffer.readUIntBE(offset + evt.size, 1));
        evt.size++;

        if (evt.size + offset >= buffer.length) {
            return evt;
        }

        if ((eventType & 0xF0) != 0xC0) {
            data.push(buffer.readUIntBE(offset + evt.size + 1, 1));
            evt.size++;

            if (evt.size + offset >= buffer.length) {
                return evt;
            }
        }

        if ((eventType & 0xF0) == 0x80 || (eventType & 0xF0) == 0x90)
        {
            evt.type = 'note';
            evt.data = {
                event: (eventType & 0xF0) == 0x80 ? 'off' : 'on',
                note: data[0],
                velocity: data[1]
            }

            if (evt.data.velocity == 0x00) {
                evt.data.event = 'off';
            }
        }
        else
        {
            evt.type = 'voice';
            evt.data = {
                type: eventType.toString(16),
                data: data
            }
        }
    }

    return evt;
}

function load(fileName)
{
    var song = new Song();

    var file = fs.openSync(fileName, 'r');

    var chunks = [];

    var continueReading = false;
    do
    {
        var chunk = Chunk.Read(file);

        if (!chunk.isGarbage)
            chunks.push(chunk);
        
        continueReading = !chunk.isGarbage;
    } while (continueReading);

    var head = Chunk.Find(chunks, 'MThd');
    var tracks = Chunk.FindAll(chunks, 'MTrk');

    if (!readHead(head, song))
        return undefined;
    
    for (var i = 0; i < tracks.length; i++)
    {
        var track = tracks[i];
        song.events.push([]);
        continueReading = false;
        var offset = 0;
        var trackContainsNotes = false;
        var lastEvent = undefined;
        do
        {
            var evt = readEvent(track.data, offset, lastEvent);
            lastEvent = evt;
            song.events[i].push(evt);
            offset += evt.size;

            if (evt.type == 'name')
            {
                if (song.tracks[i].name != '') song.tracks[i].name += ' - ';
                song.tracks[i].name += evt.data;
            }
            else if (evt.type == 'instrument_name')
            {
                song.tracks[i].instrument = evt.data;
            }
            else if (evt.type == 'note')
            {
                trackContainsNotes = true;
            }
            else if (evt.type == 'tempo' && i == 0 && song.format == 0x01)
            {
                song.setUsPerBeat(evt.data.usPerBeat);
            }

            continueReading = offset < track.data.length;
        } while (continueReading);

        if (trackContainsNotes)
        {
            song.tracks[i].dataOnly = false;
        }
    }

    fs.closeSync(file);

    return song;
}

module.exports.load = load;
module.exports.Song = Song;