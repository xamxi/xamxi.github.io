import { showToast } from './script.js';
import { LANG } from './lang/index.js';

const tRoom = (key) => {
    const lang = localStorage.getItem("lang") || "en";
    return LANG[lang]?.room?.[key];
};

export function initRoomInteractions() {

    // Chalkboard: cycle messages on click
    const chalkMessages = tRoom('chalk');
    let chalkIdx = 0;
    document.querySelector('.chalkboard').addEventListener('click', function () {
        chalkIdx = (chalkIdx + 1) % chalkMessages.length;
        document.getElementById('chalkText').textContent = chalkMessages[chalkIdx];
        this.classList.add('wiggle');
        setTimeout(() => this.classList.remove('wiggle'), 400);
        showToast('📋 ' + chalkMessages[chalkIdx]);
    });

    // Books: each book shows a random title on click
    const bookQuips = tRoom('books');
    document.querySelectorAll('#scene-study .book').forEach((book, i) => {
        book.style.cursor = 'pointer';
        book.addEventListener('click', function () {
            showToast(bookQuips[i % bookQuips.length]);
            this.classList.add('pop');
            setTimeout(() => this.classList.remove('pop'), 300);
        });
    });

    // Laptop: cycle screen states on click
    const laptopScreens = tRoom('laptop');
    let laptopIdx = 0;
    document.querySelector('.laptop').addEventListener('click', function () {
        laptopIdx = (laptopIdx + 1) % laptopScreens.length;
        showToast('💻 ' + laptopScreens[laptopIdx]);
        this.classList.add('pop');
        setTimeout(() => this.classList.remove('pop'), 300);
    });

    // Desk lamp: toggle glow
    let lampOn = true;
    document.querySelector('.desk-lamp').addEventListener('click', function () {
        lampOn = !lampOn;
        this.querySelector('.dl-glow').style.opacity = lampOn ? '1' : '0';
        this.querySelector('.dl-shade').style.filter = lampOn ? 'brightness(1.4)' : 'brightness(0.6)';
        showToast(lampOn ? tRoom('lampOn') : tRoom('lampOff'));
    });

    // Plant: random quip
    const plantQuips = tRoom('plant');
    document.querySelectorAll('.plant').forEach(plant => {
        plant.style.cursor = 'pointer';
        plant.addEventListener('click', function () {
            showToast(plantQuips[Math.floor(Math.random() * plantQuips.length)]);
            this.classList.add('pop');
            setTimeout(() => this.classList.remove('pop'), 300);
        });
    });

    // Rug: wiggle
    document.querySelectorAll('.rug').forEach(rug => {
        rug.style.cursor = 'pointer';
        rug.addEventListener('click', function () {
            showToast(tRoom('rug'));
            this.classList.add('wiggle');
            setTimeout(() => this.classList.remove('wiggle'), 400);
        });
    });

    // Notebook
    document.querySelector('.notebook').addEventListener('click', function () {
        const notes = tRoom('notebook');
        showToast('📝 ' + notes[Math.floor(Math.random() * notes.length)]);
    });

    // Pencil cup
    document.querySelector('.pencil-cup').addEventListener('click', function () {
        showToast(tRoom('pencil'));
    });

    // --- PLAYAH ROOM ---

    // Game controller
    const controllerQuips = tRoom('controller');
    document.querySelector('.game-controller').addEventListener('click', function () {
        this.classList.add('wiggle');
        setTimeout(() => this.classList.remove('wiggle'), 400);
        showToast(controllerQuips[Math.floor(Math.random() * controllerQuips.length)]);
    });

    // Mug: gets cold each click
    let mugTemp = 100;
    document.querySelector('.mug').addEventListener('click', function () {
        mugTemp = Math.max(20, mugTemp - 15);
        if (mugTemp > 70) showToast(`${tRoom('mugHot')} ${mugTemp}°`);
        else if (mugTemp > 40) showToast(`${tRoom('mugWarm')} ${mugTemp}°`);
        else showToast(`${tRoom('mugCold')} ${mugTemp}°`);
    });

    // Window: random weather
    const weathers = tRoom('window');
    document.querySelector('.window-decor').addEventListener('click', function () {
        showToast(weathers[Math.floor(Math.random() * weathers.length)]);
    });

    // Curtains
    document.querySelectorAll('.curtain').forEach(c => {
        c.addEventListener('click', function () {
            showToast(tRoom('curtain'));
        });
    });

    // Floor lamp
    let floorLampOn = true;
    document.querySelector('.lamp').addEventListener('click', function () {
        floorLampOn = !floorLampOn;
        this.querySelector('.lamp-glow').style.opacity = floorLampOn ? '1' : '0';
        this.querySelector('.lamp-shade').style.filter = floorLampOn ? 'brightness(1.3)' : 'brightness(0.5)';
        showToast(floorLampOn ? tRoom('floorLampOn') : tRoom('floorLampOff'));
    });

    // Bookshelf books (playah room)
    document.querySelectorAll('#scene-playah .book').forEach((book, i) => {
        book.style.cursor = 'pointer';
        book.addEventListener('click', function () {
            showToast(bookQuips[i % bookQuips.length]);
            this.classList.add('pop');
            setTimeout(() => this.classList.remove('pop'), 300);
        });
    });
}

