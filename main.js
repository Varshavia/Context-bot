const { app, BrowserWindow, ipcMain, shell } = require('electron'); // shell modülünü ekledik
const path = require('path');
const { exec } = require('child_process');
const { WebSocketServer } = require('ws'); 
const fs = require('fs');

let chromeTabsDetail = []; // Artık sadece başlıkları değil, URL'leri de burada tutuyoruz

// WebSocket Sunucusu
const wss = new WebSocketServer({ port: 8080 }, () => {
    console.log('WebSocket Sunucusu 8080 portunda hazır! 🚀');
});

wss.on('connection', (ws) => {
    console.log('Tarayıcı eklentisi bağlandı! ✅');
    ws.on('message', (message) => {
        try {
            chromeTabsDetail = JSON.parse(message); // [{title: "...", url: "..."}] şeklinde geliyor
        } catch (e) { console.error("Veri hatası:", e); }
    });
    ws.on('close', () => { chromeTabsDetail = []; });
});

function createWindow() {
    const win = new BrowserWindow({
        width: 1000,
        height: 700,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        }
    });
    win.loadFile(path.join(__dirname, './public/index.html'));
}

ipcMain.on('load-snapshots', (event) => {
    const filePath = path.join(app.getPath('userData'), 'snapshots.json');
    if (fs.existsSync(filePath)) {
        const snapshots = JSON.parse(fs.readFileSync(filePath));
        event.reply('snapshot-saved', snapshots);
    }
});

// 1. Tarama Motoru (platforma göre pencere/uygulama tarama komutu seçilir)
function getOsWindowTitles(callback) {
    if (process.platform === 'win32') {
        const cmd = `powershell "Get-Process | Where-Object {$_.MainWindowTitle} | Select-Object -ExpandProperty MainWindowTitle"`;
        exec(cmd, { maxBuffer: 1024 * 1024 }, (err, stdout) => {
            if (err || !stdout) return callback([]);
            callback(stdout.split('\r\n').map(line => line.trim()).filter(Boolean));
        });
        return;
    }

    if (process.platform === 'darwin') {
        const cmd = `osascript -e 'tell application "System Events" to get name of every process whose visible is true'`;
        exec(cmd, { maxBuffer: 1024 * 1024 }, (err, stdout) => {
            if (err || !stdout) return callback([]);
            // AppleScript comma-separated list, e.g. "Finder, Safari, Terminal"
            callback(stdout.split(',').map(line => line.trim()).filter(Boolean));
        });
        return;
    }

    if (process.platform === 'linux') {
        // Requires wmctrl (apt install wmctrl / dnf install wmctrl). If it's not
        // installed we degrade gracefully to just the Chrome tabs instead of crashing.
        exec('wmctrl -l', { maxBuffer: 1024 * 1024 }, (err, stdout) => {
            if (err || !stdout) {
                console.warn("Linux pencere taraması için 'wmctrl' bulunamadı ya da çalıştırılamadı. Kurmak için: sudo apt install wmctrl");
                return callback([]);
            }
            // wmctrl -l columns: <window id> <desktop> <client machine> <title...>
            const titles = stdout.split('\n')
                .map(line => line.trim())
                .filter(Boolean)
                .map(line => line.split(/\s+/).slice(3).join(' ').trim())
                .filter(Boolean);
            callback(titles);
        });
        return;
    }

    // Unknown platform: no OS-level window scanning available.
    callback([]);
}

ipcMain.on('scan-windows', (event) => {
    getOsWindowTitles((rawTitles) => {
        const osWindows = rawTitles
            .filter(line => line && line.length > 2 && !line.includes("Google Chrome") && !line.includes("Context Bot"));

        // Arayüzde listelemek için sadece başlıkları gönderiyoruz
        const formattedTabs = chromeTabsDetail.map(tab => `[Chrome] ${tab.title}`);
        const finalResults = [...new Set([...osWindows, ...formattedTabs])];

        event.reply('scan-results', finalResults);
    });
});

// 2. Snapshot Kaydetme (Geliştirilmiş: URL'leri de Gömüyoruz)
ipcMain.on('save-snapshot', (event, { name }) => {
    const filePath = path.join(app.getPath('userData'), 'snapshots.json');
    let snapshots = [];
    
    if (fs.existsSync(filePath)) {
        try { snapshots = JSON.parse(fs.readFileSync(filePath)); } catch (e) { snapshots = []; }
    }

    const newSnapshot = {
        id: Date.now(),
        name: name,
        osWindows: [], // Opsiyonel: İlerde VS Code gibi uygulamaları açmak için
        chromeTabs: chromeTabsDetail, // SİHİR BURADA: URL'ler burada saklanıyor
        timestamp: new Date().toLocaleString()
    };

    snapshots.push(newSnapshot);
    fs.writeFileSync(filePath, JSON.stringify(snapshots, null, 2));
    event.reply('snapshot-saved', snapshots);
});

// 3. SİHİRLİ DÜĞME: Geri Yükleme (Restore)
ipcMain.on('restore-snapshot', (event, snapshotId) => {
    const filePath = path.join(app.getPath('userData'), 'snapshots.json');
    if (!fs.existsSync(filePath)) return;

    const snapshots = JSON.parse(fs.readFileSync(filePath));
    const target = snapshots.find(s => s.id === snapshotId);

    if (target && target.chromeTabs) {
        console.log(`${target.name} bağlamı geri yükleniyor...`);
        // Kayıtlı her bir URL'yi varsayılan tarayıcıda açar
        target.chromeTabs.forEach(tab => {
            shell.openExternal(tab.url);
        });
    }
});

ipcMain.on('delete-snapshot', (event, snapshotId) => {
    const filePath = path.join(app.getPath('userData'), 'snapshots.json');
    if (!fs.existsSync(filePath)) {
        event.reply('snapshot-saved', []);
        return;
    }

    let snapshots = [];
    try {
        snapshots = JSON.parse(fs.readFileSync(filePath));
    } catch (e) {
        console.error("Snapshot dosyası okunamadı:", e);
        event.reply('snapshot-saved', []);
        return;
    }

    snapshots = snapshots.filter(s => s.id !== snapshotId);
    fs.writeFileSync(filePath, JSON.stringify(snapshots, null, 2));
    event.reply('snapshot-saved', snapshots);
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});