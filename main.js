// main.js
const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const url = require('url');
const isDev = require('electron-is-dev'); // To check if in development

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false, // Best practice for security
      contextIsolation: true, // Best practice for security
      // preload: path.join(__dirname, 'preload.js'), // Optional: if you need to expose Node.js APIs securely
    },
    icon: path.join(__dirname, 'src/assets/icons/icon-512x512.png') // Path to your app icon
  });

  // Determine the path to load
  const startURL = isDev
    ? 'http://localhost:4200' // URL of your Angular dev server (ng serve)
    : url.format({
        pathname: path.join(__dirname, 'dist/quiz-app/index.html'), // Path to your built Angular app's index.html
        protocol: 'file:',
        slashes: true,
      });

  mainWindow.loadURL(startURL);

  if (isDev) {
    mainWindow.webContents.openDevTools(); // Open DevTools automatically in development
  } else {
    // Remove menu bar in production (optional)
    Menu.setApplicationMenu(null);
  }


  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') { // macOS apps usually stay active
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});