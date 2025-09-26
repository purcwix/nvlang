const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const configPath = process.argv[2];
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

app.whenReady().then(() => {
  const win = new BrowserWindow({
    ...config,
    webPreferences: { nodeIntegration: false }
  });
  win.loadURL('data:text/html,' + encodeURIComponent(config.content || ''));
});