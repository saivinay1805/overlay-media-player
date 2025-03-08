# Overlay Media Player

Overlay Media Player is an open-source, lightweight, transparent media player built with Electron. It allows you to play videos with customizable overlays, ideal for presentations, gaming, or media previews. Features include:

- Toggle transparency with chroma key color selection (Black, Green, Blue, Custom)
- Lock/Unlock window click-through
- Resize options (50%, 100%, 150%)
- Slider for video control
- Drag to move
- Double-tap for next video
- Context menu for playback control
- Support for .webm and .mp4 files

## Download

Download the latest version of Overlay Media Player:
- [Overlay Media Player v1.0.0 (.dmg)](https://github.com/saivinay1805/overlay-media-player/releases/download/v1.0.0/Overlay-Media-Player-1.0.0.dmg)

## Installation

1. Clone the repository:
   git clone https://github.com/saivinay1805/overlay-media-player.git
2. Navigate to the project directory:
   cd overlay-media-player
3. Install dependencies:
   npm install
4. Create a `videos` folder and add .webm or .mp4 files:
   mkdir videos
   # Add your video files to the videos folder
5. Run the app:
   npm start

## Building for macOS

To build a .dmg file for macOS:
1. Run the build command:
   npm run build
2. Find the output in the `dist` folder.

## Usage

- Use **File > Select Video** or **Select Video Folder** menu to load videos.
- Toggle transparency with **File > Toggle Transparency** (Command+R).
- Choose a chroma key color with **File > Chroma Key Color**.
- Toggle the slider with **File > Toggle Slider** (Command+T).
- Lock/Unlock the window with **File > Lock/Unlock Window** (Command+L).
- Resize the window with **File > Resize**.
- Drag the window to move it.
- Double-tap to play the next video.
- Right-click for a context menu with additional controls (Pause/Play, Select Video, Random, Previous, Close).

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
