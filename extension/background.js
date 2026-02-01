let socket = null;

function connect() {
    // Önceki bağlantı girişimini temizle
    if (socket) {
        socket.close();
    }

    try {
        socket = new WebSocket('ws://localhost:8080');

        socket.onopen = () => {
            console.log('Bağlantı kuruldu! ✅');
            sendTabs();
        };

        socket.onmessage = (event) => {
            // İleride Electron'dan gelen "Sekmeleri aç" komutlarını buradan dinleyeceğiz
        };

        socket.onclose = () => {
            console.log('Bağlantı kapalı, 3 saniye sonra tekrar denenecek...');
            setTimeout(connect, 3000);
        };

        socket.onerror = () => {
            // Hata fırlatmasını burada yakalıyoruz, böylece Chrome "Hata" uyarısı vermiyor
            socket.close();
        };

    } catch (e) {
        console.log("Bağlantı denemesi başarısız, sunucu kapalı olabilir.");
        setTimeout(connect, 3000);
    }
}

async function sendTabs() {
    try {
        const tabs = await chrome.tabs.query({});
        const tabData = tabs.map(t => ({ title: t.title, url: t.url }));
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(tabData));
        }
    } catch (err) {
        console.error("Sekme bilgileri alınamadı:", err);
    }
}

// Olay dinleyicileri
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'complete') sendTabs();
});
chrome.tabs.onRemoved.addListener(sendTabs);

connect();