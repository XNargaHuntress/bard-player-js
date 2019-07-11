var readline = require('readline');
var midiPlayer = require('./MidiPlayer.js');
var fs = require('fs');

readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);

var stdout = process.stdout;

stdout.write('\u001B[?25l');

process.on('exit', () => {
    manager.clearConsole(stdout);
    process.stdout.write('\u001B[?25h')
});

class ScreenManager
{
    constructor(options)
    {
        this.screens = [];

        for (var prop in options)
        {
            if (this.hasOwnProperty(prop))
                this[prop] = options[prop]
        }

        this.current = this.screens[this.screens.length - 1];
    }

    push(screen) {
        this.screens.push(screen);
        this.current = screen;

        this.current.dirty = true;
    }

    pop(screen) {
        var screen = this.screens.pop();
        this.current = this.screens[this.screens.length - 1];

        this.current.dirty = true;

        return screen;
    }

    display() {
        this.current = this.screens[this.screens.length - 1];
        if (this.current !== undefined)
            this.current.display();
    }

    update() {
        if (this.current !== undefined && this.current.update !== undefined) {
            this.current.update();
            this.current.dirty = false;
        }
    }

    handleKeyEvent(str, key) {
        if (this.current !== undefined)
            this.current.onKey(str, key);
    }

    clearConsole(stream) {
        readline.cursorTo(stream, 0, 0);
        readline.clearScreenDown(stream);
        stream.write('\x1Bc');
    }
}
var manager = new ScreenManager();
setInterval(manager.update.bind(manager), 1000 / 4);

process.stdin.on('keypress', (str, key) => {
    if (key.ctrl && key.name === 'c') {
        process.exit();
    }
    else {
        manager.handleKeyEvent(str, key);
    }
});

// boiler plate done

var songSelection = {
    songList: [
        'Vamo alla Flamenco',
        'To Xanarkand',
        'One Winged Angel',
        'Highway to Hell',
        "Beethoven's 3rd",
        'Ategnatos',
        'Helvetios',
        'Over the Rainbow',
        'That one time on the road',
        'The Highwayman',
        'La Suerte de los Tontos',
        'Final Countdown',
        'Seven Days a Heathen',
        'Way of Vikings',
        'Halo Theme',
        'FF7 Battle Theme',
        'Hall of the Mountain King'
    ],
    selectedIndex: 0,
    windowIndex: 0,
    timer: 0,
    selectedSong: undefined,
    offsetIndex: 0,
    waitFrames: 2,
    display: function() {
        manager.clearConsole(stdout);
        console.log('╘═Bard Player══╛');
        console.log();

        for (var i = 0; i < 13; i++)
        {
            if (i + this.windowIndex >= this.songList.length) break;
            if (this.selectedSong === undefined) this.selectedSong = this.songList[this.selectedIndex];

            if (i + this.windowIndex == this.selectedIndex) {
                console.log('■' + this.selectedSong.substr(0, 15));
            }
            else
            {
                console.log(' ' + this.songList[i + this.windowIndex].substr(0, 15));
            }
        }

        if (this.songList.length > 13 && this.selectedIndex != this.songList.length - 1) {
            console.log(' ...');
        }
    },
    update: function() {
        if (this.dirty) this.display();
        if (this.songList[this.selectedIndex].length > 15 && this.waitFrames <= 0)
        {
            var len = this.songList[this.selectedIndex].length;
            var name = this.songList[this.selectedIndex];
            this.offsetIndex = (this.offsetIndex + 1) % (len + 3);
            this.selectedSong = name + '   ' + name;
            
            readline.cursorTo(stdout, 0, 2 + this.selectedIndex - this.windowIndex);
            console.log('■' + this.selectedSong.substr(this.offsetIndex, 15));
        }

        this.waitFrames--;
        this.waitFrames = this.waitFrames < 0 ? 0 : this.waitFrames;
    },
    onKey: function(str, key) {
        if (key.name === 'down') {
            this.selectedIndex = (this.selectedIndex + 1) % this.songList.length;
            this.selectedSong = this.songList[this.selectedIndex];
            this.offsetIndex = 0;
            this.waitFrames = 2;
        } else if (key.name === 'up') {
            this.selectedIndex = ((this.selectedIndex + this.songList.length) - 1) % this.songList.length;
            this.selectedSong = this.songList[this.selectedIndex];
            this.offsetIndex = 0;
            this.waitFrames = 2;
        } else if (key.name.toLowerCase() === 'a') {
            songScreen.loadSong(this.songList[this.selectedIndex]);
            manager.push(songScreen);
        } else if (key.name.toLowerCase() === 'r') {
            this.refreshList();
        }

        if (this.selectedIndex >= 12) {
            this.windowIndex = this.selectedIndex - 12;
        } else {
            this.windowIndex = 0;
        }

        this.display();
    },
    refreshList: function() {
        while (this.songList.length > 0) { this.songList.pop() }
        var contents = fs.readdirSync('./');
        this.songList = contents.filter((f) => { return f.match(/.+\.midi?/ig); });

        this.selectedIndex = 0;
        this.windowIndex = 0;
        this.offsetIndex = 0;
        this.waitFrames = 2;

        this.display();
    }
};

var scale = [
    'C ', 'C#', 'D ', 'Eb', 'E ', 'F ', 'F#', 'G ', 'Ab', 'A ', 'Bb', 'B '
];

function noteHandler(noteData)
{
    if (manager.current == songScreen) {
        var note = scale[noteData.note % scale.length];
        var octave = ('00' + ((noteData.note / scale.length) | 0)).slice(-2);

        readline.cursorTo(stdout, 7, 10);
        stdout.write('╒══╤════╕');
        readline.moveCursor(stdout, -9, 1);
        stdout.write('│' + octave + '│    │');
        readline.moveCursor(stdout, -9, 1);
        stdout.write('╘══╡ ' + note + ' │');
        readline.moveCursor(stdout, -6, 1);
        stdout.write('│    │');
        readline.moveCursor(stdout, -6, 1);
        stdout.write('╘════╛');
        readline.moveCursor(stdout, -6, 1);
    }
}

var songScreen = {
    songFile: '',
    songName: '',
    selectedTrack: 0,
    menuIndex: 0,
    offsetIndex: 0,
    trackNameOffset: 0,
    trackInstrOffset: 0,
    song: undefined,
    waitFrames: 3,
    displayHeader: function() {
        manager.clearConsole(stdout);
        console.log('╘═Bard Player══╛');
        console.log(' ' + this.songName.substr(0, 15));
    },
    clearMenuArea: function() {
        readline.cursorTo(stdout, 0, 2);
        for (var i = 0; i < 8; i++)
        {
            readline.clearLine(stdout, 0);
            readline.moveCursor(stdout, 0, 1);
        }
    },
    displayMenu: function() {
        this.clearMenuArea();
        readline.cursorTo(stdout, 0, 2);
        console.log();
        console.log((this.menuIndex == 0 ? '■' : ' ') + 'Track:');
        readline.moveCursor(stdout, 0, 2);
        console.log();
        console.log((this.menuIndex == 1 ? '■' : ' ') + (this.song.paused ? 'Play' : 'Pause'));
        console.log((this.menuIndex == 2 ? '■' : ' ') + 'Stop');
        console.log((this.menuIndex == 3 ? '■' : ' ') + 'Back');
    },
    displayTrack: function() {
        readline.cursorTo(stdout, 0, 4);
        console.log('  ' + this.song.tracks[this.selectedTrack].name.substr(0, 14));
        console.log('  ' + this.song.tracks[this.selectedTrack].instrument.substr(0, 14));
    },
    display: function() {
        this.displayHeader();
        this.displayMenu();
        this.displayTrack();
    },
    update: function() {
        if (this.dirty) this.display();
        if (this.songName.length > 15) {
            this.offsetIndex = (this.offsetIndex + 1) % (this.songName.length + 3);
            this.selectedSong = this.songName + '   ' + this.songName;
            
            readline.cursorTo(stdout, 0, 1);
            console.log(' ' + this.selectedSong.substr(this.offsetIndex, 15));
        }

        var track = this.song.tracks[this.selectedTrack];
        if (track.name.length > 14 && this.menuIndex == 0 && this.waitFrames <= 0) {
            this.trackNameOffset = (this.trackNameOffset + 1) % (track.name.length + 3);
            var trackName = track.name + '   ' + track.name;

            readline.cursorTo(stdout, 0, 4);
            console.log('  ' + trackName.substr(this.trackNameOffset, 14));
        }

        if (track.instrument.length > 14 && this.menuIndex == 0 && this.waitFrames <= 0) {
            this.trackInstrOffset = (this.trackInstrOffset + 1) % (track.instrument.length + 3);
            var instrument = track.instrument + '   ' + track.instrument;

            readline.cursorTo(stdout, 0, 5);
            console.log('  ' + instrument.substr(this.trackInstrOffset, 14));
        }

        this.waitFrames--;
        this.waitFrames = this.waitFrames < 0 ? 0 : this.waitFrames;
    },
    onKey: function(str, key) {
        var refresh = false;
        if (key.name === 'down') {
            this.menuIndex = (this.menuIndex + 1) % 4;
            this.trackInstrOffset = 0;
            this.trackNameOffset = 0;
            this.waitFrames = 2;
            refresh = true;
        } else if (key.name === 'up') {
            this.menuIndex = (4 + this.menuIndex - 1) % 4;
            this.trackInstrOffset = 0;
            this.trackNameOffset = 0;
            this.waitFrames = 2;
            refresh = true;
        } else if (key.name === 'left' && this.menuIndex == 0 && this.song.paused) {
            this.selectedTrack = (this.selectedTrack + 1) % this.song.tracks.length;

            while (this.song.tracks[this.selectedTrack].dataOnly)
            {
                this.selectedTrack = (this.selectedTrack + 1) % this.song.tracks.length;
            }

            this.trackInstrOffset = 0;
            this.trackNameOffset = 0;
            this.waitFrames = 2;
            refresh = true;
        } else if (key.name === 'right' && this.menuIndex == 0 && this.song.paused) {
            this.selectedTrack = (this.song.tracks.length + this.selectedTrack - 1) % this.song.tracks.length;

            while (this.song.tracks[this.selectedTrack].dataOnly)
            {
                this.selectedTrack = (this.song.tracks.length + this.selectedTrack - 1) % this.song.tracks.length;
            }

            this.trackInstrOffset = 0;
            this.trackNameOffset = 0;
            this.waitFrames = 2;
            refresh = true;
        } else if (key.name.toLowerCase() === 'a') {
            if (this.menuIndex == 3)
            {
                manager.pop();
            }

            if (this.menuIndex == 1)
            {
                if (!this.song.paused) {
                    this.song.pause();
                } else {
                    this.song.play(this.selectedTrack);
                }

                refresh = true;
            }

            if (this.menuIndex == 2)
            {
                refresh = !this.song.paused;
                this.song.stop();
            }
        }

        if (refresh) {
            this.displayMenu();
            this.displayTrack();
        }
    },
    loadSong: function(name) {
        this.songFile = name;
        this.songName = name;
        this.selectedTrack = 0;
        this.menuIndex = 0;
        this.waitFrames = 2;

        if (this.song !== undefined) this.song.stop();

        this.song = midiPlayer.load(this.songFile);
        this.song.noteCallback = noteHandler;
        this.song.setFps(60);
        this.song.arpeggioize(1);

        for (var i = 0; i < this.song.tracks.length; i++)
        {
            if (!this.song.tracks[i].dataOnly) {
                this.selectedTrack = i;
                break;
            }
        }
    }
};

manager.push(songSelection);
songSelection.refreshList();