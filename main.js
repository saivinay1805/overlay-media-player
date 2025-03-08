const { app, BrowserWindow, ipcMain, Menu, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Enable hardware acceleration with optimized settings
app.commandLine.appendSwitch('enable-transparent-visuals');
app.commandLine.appendSwitch('disable-software-compositing');

const windows = new Set();
let selectedVideoFolder = null; // Store the user-selected folder
let isWindowLocked = true; // Default to locked (clicks are captured)
let isSliderVisible = false; // Default to slider hidden
let isTransparencyEnabled = false; // Default to transparency disabled
let chromaKeyColor = '#000000'; // Default to black

// Path to store configuration
const configDir = app.getPath('appData') + '/OverlayMediaPlayer';
const configPath = path.join(configDir, 'config.json');

function ensureConfigDir() {
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
    console.log('Created config directory:', configDir);
  }
}

function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (config.selectedVideoFolder && fs.existsSync(config.selectedVideoFolder)) {
        selectedVideoFolder = config.selectedVideoFolder;
        console.log('Loaded last selected folder from config:', selectedVideoFolder);
      } else {
        console.log('Last selected folder in config is invalid or missing');
      }
      if (typeof config.isWindowLocked === 'boolean') {
        isWindowLocked = config.isWindowLocked;
        console.log('Loaded window lock state from config:', isWindowLocked);
      }
      if (typeof config.isSliderVisible === 'boolean') {
        isSliderVisible = config.isSliderVisible;
        console.log('Loaded slider visibility state from config:', isSliderVisible);
      }
      if (typeof config.isTransparencyEnabled === 'boolean') {
        isTransparencyEnabled = config.isTransparencyEnabled;
        console.log('Loaded transparency state from config:', isTransparencyEnabled);
      }
      if (config.chromaKeyColor) {
        chromaKeyColor = config.chromaKeyColor;
        console.log('Loaded chroma key color from config:', chromaKeyColor);
      }
    }
  } catch (err) {
    console.error('Error loading config:', err);
  }
}

function saveConfig() {
  ensureConfigDir();
  const config = { selectedVideoFolder, isWindowLocked, isSliderVisible, isTransparencyEnabled, chromaKeyColor };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log('Saved config with selected folder:', selectedVideoFolder, 'lock state:', isWindowLocked, 'slider state:', isSliderVisible, 'transparency state:', isTransparencyEnabled, 'chroma key color:', chromaKeyColor);
}

function updateWindowClickThrough(win) {
  if (isWindowLocked) {
    win.setIgnoreMouseEvents(false); // Capture clicks when locked
    console.log('Window locked: clicks captured');
  } else {
    win.setIgnoreMouseEvents(true, { forward: true }); // Allow clicks to pass through when unlocked
    console.log('Window unlocked: clicks pass through');
  }
}

function resizeWindow(win, scale) {
  const defaultWidth = 660;
  const defaultHeight = 706;
  const newWidth = Math.round(defaultWidth * scale);
  const newHeight = Math.round(defaultHeight * scale);
  win.setSize(newWidth, newHeight);
  console.log(`Window resized to ${newWidth}x${newHeight} (scale: ${scale})`);
  win.webContents.send('resize-canvas'); // Notify renderer to update canvas
}

function createWindow() {
  const win = new BrowserWindow({
    width: 660,
    height: 706,
    transparent: true,
    alwaysOnTop: true, // Keep window on top
    backgroundColor: '#00000000',
    resizable: true,
    frame: false, // Ensures no native title bar or buttons
    hasShadow: false, // Remove window shadow
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadFile('index.html');
  const position = windows.size > 0 ? 100 + (windows.size * 20) : 100;
  win.setPosition(position, position);
  win.setContentProtection(true);
  win.setBackgroundThrottling(false);

  // Apply initial click-through setting
  updateWindowClickThrough(win);

  win.once('ready-to-show', () => {
    win.webContents.invalidate();
    win.show();
    console.log('Window ready and shown');

    // Notify renderer to load videos from default or last selected folder
    win.webContents.send('load-videos');
    win.webContents.send('update-slider-visibility', isSliderVisible); // Send initial slider state
    win.webContents.send('update-transparency', isTransparencyEnabled); // Send initial transparency state
    win.webContents.send('update-chroma-key-color', chromaKeyColor); // Send initial chroma key color
  });

  win.on('focus', () => {
    win.webContents.invalidate();
  });

  win.on('blur', () => {
    win.webContents.invalidate();
    let invalidationCount = 0;
    const invalidationInterval = setInterval(() => {
      win.webContents.invalidate();
      invalidationCount++;
      if (invalidationCount >= 25) {
        clearInterval(invalidationInterval);
      }
    }, 30);
  });

  win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Load failed:', errorCode, errorDescription);
  });

  windows.add(win);
  win.on('closed', () => {
    windows.delete(win);
    console.log('Window closed, remaining windows:', windows.size);
  });

  console.log('Window transparency enabled:', true);
}

ipcMain.handle('get-video-list', async () => {
  let videosDir = selectedVideoFolder || path.join(__dirname, 'videos');

  // Ensure the default videos directory exists in the bundle
  if (!selectedVideoFolder && !fs.existsSync(videosDir)) {
    try {
      fs.mkdirSync(videosDir, { recursive: true });
      console.log('Created default videos directory:', videosDir);
    } catch (err) {
      console.error('Error creating default videos directory:', err);
    }
  }

  try {
    const files = await fs.promises.readdir(videosDir);
    const videoFiles = files
      .filter(file => file.endsWith('.webm') || file.endsWith('.mp4'))
      .map(file => path.join(videosDir, file)); // Support both .webm and .mp4
    if (videoFiles.length === 0) {
      console.warn('No .webm or .mp4 videos found in directory:', videosDir);
    }
    return videoFiles;
  } catch (err) {
    console.error('Error reading videos directory:', err);
    return [];
  }
});

ipcMain.on('show-context-menu', (event) => {
  console.log('Main: Received show-context-menu request');
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) {
    console.error('Main: Could not find window for context menu');
    return;
  }
  const template = [
    {
      label: 'Pause/Play',
      click: () => {
        event.sender.send('toggle-pause-play');
        console.log('Main: Sent toggle-pause-play');
      }
    },
    {
      label: 'Select Video',
      click: async () => {
        console.log('Main: Handling Select Video directly');
        const defaultPath = selectedVideoFolder || path.join(__dirname, 'videos');
        const result = await dialog.showOpenDialog({
          title: 'Select a WebM or MP4 Video',
          defaultPath: defaultPath,
          filters: [{ name: 'Video Files', extensions: ['webm', 'mp4'] }],
          properties: ['openFile']
        });
        if (!result.canceled && result.filePaths.length > 0) {
          const selectedFile = result.filePaths[0];
          event.sender.send('video-selected', selectedFile);
          console.log('Main: Sent video-selected with file:', selectedFile);
        } else {
          event.sender.send('video-selected', null);
          console.log('Main: No file selected, sent null');
        }
      }
    },
    {
      label: 'Select Video Folder',
      click: async () => {
        console.log('Main: Handling Select Video Folder');
        const result = await dialog.showOpenDialog({
          title: 'Select a Folder with WebM or MP4 Videos',
          defaultPath: selectedVideoFolder || app.getPath('videos'),
          properties: ['openDirectory']
        });
        if (!result.canceled && result.filePaths.length > 0) {
          selectedVideoFolder = result.filePaths[0];
          console.log('User selected new video folder:', selectedVideoFolder);
          saveConfig(); // Save the new folder to config
          win.webContents.send('load-videos');
        } else {
          console.log('User canceled folder selection');
        }
      }
    },
    {
      label: 'Random',
      click: () => {
        event.sender.send('play-random');
        console.log('Main: Sent play-random');
      }
    },
    {
      label: 'Previous',
      click: () => {
        event.sender.send('play-previous');
        console.log('Main: Sent play-previous');
      }
    },
    {
      label: 'Close',
      click: () => {
        console.log('Main: Handling Close directly');
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) {
          win.close();
          console.log('Main: Window closed successfully');
        } else {
          console.error('Main: Failed to get window for closing');
        }
      }
    }
  ];
  const menu = Menu.buildFromTemplate(template);
  menu.popup({ window: win });
});

ipcMain.on('toggle-pause-play', (event) => {
  event.sender.send('toggle-pause-play');
  console.log('Main: Relayed toggle-pause-play');
});

ipcMain.on('play-random', (event) => {
  event.sender.send('play-random');
  console.log('Main: Relayed play-random');
});

ipcMain.on('play-previous', (event) => {
  event.sender.send('play-previous');
  console.log('Main: Relayed play-previous');
});

ipcMain.on('select-video', async (event) => {
  console.log('Main: Received select-video request from File menu');
  const defaultPath = selectedVideoFolder || path.join(__dirname, 'videos');
  const result = await dialog.showOpenDialog({
    title: 'Select a WebM or MP4 Video',
    defaultPath: defaultPath,
    filters: [{ name: 'Video Files', extensions: ['webm', 'mp4'] }],
    properties: ['openFile']
  });
  if (!result.canceled && result.filePaths.length > 0) {
    const selectedFile = result.filePaths[0];
    event.sender.send('video-selected', selectedFile);
    console.log('Main: Sent video-selected with file (File menu):', selectedFile);
  } else {
    event.sender.send('video-selected', null);
    console.log('Main: No file selected (File menu), sent null');
  }
});

ipcMain.handle('get-window-position', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    return win.getPosition();
  }
  return [0, 0];
});

ipcMain.on('move-window', (event, deltaX, deltaY) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    const [currentX, currentY] = win.getPosition();
    win.setPosition(currentX + deltaX, currentY + deltaY, false);
    console.log('Window moved to:', currentX + deltaX, currentY + deltaY);
  } else {
    console.error('Main: Failed to get window for moving');
  }
});

ipcMain.on('select-chroma-key-color', (event) => {
  const colorPickerWin = new BrowserWindow({
    width: 300,
    height: 150,
    frame: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });
  colorPickerWin.loadFile('color-picker.html');
  colorPickerWin.on('closed', () => {
    const focusedWin = BrowserWindow.getFocusedWindow();
    if (focusedWin) {
      focusedWin.webContents.send('update-chroma-key-color', chromaKeyColor);
    }
  });
});

ipcMain.on('update-chroma-key-color', (event, color) => {
  chromaKeyColor = color;
  saveConfig();
  console.log('Updated chroma key color to:', color);
  const focusedWin = BrowserWindow.getFocusedWindow();
  if (focusedWin) {
    focusedWin.webContents.send('update-chroma-key-color', chromaKeyColor);
  }
});

const createMenu = () => {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Window',
          accelerator: 'Shift+Command+N',
          click: () => {
            console.log('New Window menu item clicked');
            createWindow();
          }
        },
        {
          label: 'Select Video',
          accelerator: 'Command+O',
          click: () => {
            console.log('Select Video menu item clicked');
            const focusedWin = BrowserWindow.getFocusedWindow();
            if (focusedWin) {
              focusedWin.webContents.send('select-video');
            } else {
              console.error('No focused window to send select-video');
            }
          }
        },
        {
          label: 'Select Video Folder',
          click: async () => {
            console.log('Main: Handling Select Video Folder from File menu');
            const focusedWin = BrowserWindow.getFocusedWindow();
            if (focusedWin) {
              const result = await dialog.showOpenDialog({
                title: 'Select a Folder with WebM or MP4 Videos',
                defaultPath: selectedVideoFolder || app.getPath('videos'),
                properties: ['openDirectory']
              });
              if (!result.canceled && result.filePaths.length > 0) {
                selectedVideoFolder = result.filePaths[0];
                console.log('User selected new video folder:', selectedVideoFolder);
                saveConfig(); // Save the new folder to config
                focusedWin.webContents.send('load-videos');
              } else {
                console.log('User canceled folder selection');
              }
            }
          }
        },
        {
          label: isWindowLocked ? 'Unlock Window' : 'Lock Window',
          accelerator: 'Command+L',
          click: () => {
            isWindowLocked = !isWindowLocked;
            console.log('Toggled window lock state to:', isWindowLocked);
            saveConfig(); // Save the new lock state
            const focusedWin = BrowserWindow.getFocusedWindow();
            if (focusedWin) {
              updateWindowClickThrough(focusedWin);
            }
            // Rebuild menu to update label
            Menu.setApplicationMenu(createMenu());
          }
        },
        {
          label: 'Resize',
          submenu: [
            {
              label: 'Small (50%)',
              click: () => {
                console.log('Resizing to Small (50%)');
                const focusedWin = BrowserWindow.getFocusedWindow();
                if (focusedWin) {
                  resizeWindow(focusedWin, 0.5);
                }
              }
            },
            {
              label: 'Medium (100%)',
              click: () => {
                console.log('Resizing to Medium (100%)');
                const focusedWin = BrowserWindow.getFocusedWindow();
                if (focusedWin) {
                  resizeWindow(focusedWin, 1.0);
                }
              }
            },
            {
              label: 'Large (150%)',
              click: () => {
                console.log('Resizing to Large (150%)');
                const focusedWin = BrowserWindow.getFocusedWindow();
                if (focusedWin) {
                  resizeWindow(focusedWin, 1.5);
                }
              }
            }
          ]
        },
        {
          label: 'Toggle Slider',
          accelerator: 'Command+T',
          click: () => {
            isSliderVisible = !isSliderVisible;
            console.log('Toggled slider visibility to:', isSliderVisible);
            saveConfig(); // Save the new slider state
            const focusedWin = BrowserWindow.getFocusedWindow();
            if (focusedWin) {
              focusedWin.webContents.send('update-slider-visibility', isSliderVisible);
            }
            // Rebuild menu to update label (optional, but not dynamic for this item)
            Menu.setApplicationMenu(createMenu());
          }
        },
        {
          label: 'Toggle Transparency',
          accelerator: 'Command+R',
          click: () => {
            isTransparencyEnabled = !isTransparencyEnabled;
            console.log('Toggled transparency to:', isTransparencyEnabled);
            saveConfig(); // Save the new transparency state
            const focusedWin = BrowserWindow.getFocusedWindow();
            if (focusedWin) {
              focusedWin.webContents.send('update-transparency', isTransparencyEnabled);
            }
            // Rebuild menu to update label (optional, but not dynamic for this item)
            Menu.setApplicationMenu(createMenu());
          }
        },
        {
          label: 'Chroma Key Color',
          submenu: [
            {
              label: 'Black',
              click: () => {
                chromaKeyColor = '#000000';
                saveConfig();
                console.log('Set chroma key color to Black:', chromaKeyColor);
                const focusedWin = BrowserWindow.getFocusedWindow();
                if (focusedWin) {
                  focusedWin.webContents.send('update-chroma-key-color', chromaKeyColor);
                }
              }
            },
            {
              label: 'Green',
              click: () => {
                chromaKeyColor = '#00FF00';
                saveConfig();
                console.log('Set chroma key color to Green:', chromaKeyColor);
                const focusedWin = BrowserWindow.getFocusedWindow();
                if (focusedWin) {
                  focusedWin.webContents.send('update-chroma-key-color', chromaKeyColor);
                }
              }
            },
            {
              label: 'Blue',
              click: () => {
                chromaKeyColor = '#0000FF';
                saveConfig();
                console.log('Set chroma key color to Blue:', chromaKeyColor);
                const focusedWin = BrowserWindow.getFocusedWindow();
                if (focusedWin) {
                  focusedWin.webContents.send('update-chroma-key-color', chromaKeyColor);
                }
              }
            },
            {
              label: 'Custom',
              click: () => {
                console.log('Opening color picker for custom chroma key color');
                const focusedWin = BrowserWindow.getFocusedWindow();
                if (focusedWin) {
                  focusedWin.webContents.send('select-chroma-key-color');
                }
              }
            }
          ]
        },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    }
  ];

  return Menu.buildFromTemplate(template);
};

app.whenReady().then(() => {
  loadConfig(); // Load the last selected folder, lock state, slider state, transparency state, and chroma key color on startup
  Menu.setApplicationMenu(createMenu());
  createWindow();

  app.on('activate', () => {
    if (windows.size === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});