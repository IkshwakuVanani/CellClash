# CellClash

**Cell Clash** is a real-time multiplayer browser game inspired by [Agar.io](https://agar.io), built entirely from scratch using **Node.js**, **WebSockets**, the **Canvas API**, and **MongoDB**.

Players control glowing pixelated cells, grow by consuming pellets or smaller players, and climb the leaderboard in a fast-paced arena. Built for 50+ concurrent users, with server-authoritative logic and anti-cheat mechanisms.

---

## Features

*  **Real-time multiplayer** using WebSockets
*  **Mouse-controlled glowing cells** on a pixelated Canvas
*  **Pellet & player-vs-player collision** with growth mechanics
*  **Live in-game leaderboard** with nickname tracking
*  **Server-side validation & anti-cheat logic**
*  **MongoDB-powered persistent high score database**
*  **Built for 50+ concurrent players**

---

## Tech Stack

| Layer    | Tech                          |
| -------- | ----------------------------- |
| Frontend | HTML5, Canvas API, Vanilla JS |
| Backend  | Node.js, ws (WebSocket)       |
| Database | MongoDB                       |
| Hosting  | Localhost / Render / Railway  |

---

## Folder Structure

```
CellClash/
├── client/            # Frontend files
│   ├── index.html
│   ├── style.css
│   └── game.js
├── server/            # Node.js backend
│   └── server.js
├── shared/            # Shared constants
│   └── constants.js
├── package.json
└── README.md
```

---

## Local Setup

### 1. Install Node Dependencies

```bash
npm install
```

### 2. Start MongoDB (macOS Homebrew)

```bash
brew services start mongodb/brew/mongodb-community
```

### 3. Start the Game Server

```bash
node server/server.js
```

### 4. Open the Game in Browser

```
http://localhost:3000
```

> You can open multiple tabs or devices to test real-time multiplayer.

---

## Anti-Cheat Mechanisms

* Movement + collisions calculated server-side
* Clients can only send normalized direction vectors
* Any speed hacks or malformed data is dropped
* Server throttles input updates per client

---

## Planned Features

* Emoji/emote system
* Spectator mode
* Team battles or FFA toggle
* Minimap or fog-of-war system
* Skins and cosmetics with color codes

---

## Credits

* Developed by **Ikshwaku Vanani**
* Inspired by Agar.io and other real-time .io games
* Built using raw WebSockets, HTML5 Canvas, and Node.js

---

## License

MIT License — feel free to use, remix, and deploy!
