/** 
 * File: server/server.js
 * Node.js server for Cell Clash – handles WebSocket connections, game loop, and MongoDB integration.
 */
const path = require('path');
const http = require('http');
const express = require('express');
const WebSocket = require('ws');
const { MongoClient } = require('mongodb');
const Constants = require('../shared/constants');

// Setup Express to serve client files
const app = express();
app.use(express.static(path.join(__dirname, '../client')));
const server = http.createServer(app);

// Setup WebSocket server on the same HTTP server
const wss = new WebSocket.Server({ server });

// MongoDB setup for persistent highscores
const dbUrl = 'mongodb://localhost:27017';
const dbName = 'cellclash';
const client = new MongoClient(dbUrl, { useUnifiedTopology: true });
let highscoreCollection;
client.connect().then(() => {
    const db = client.db(dbName);
    highscoreCollection = db.collection('highscores');
    highscoreCollection.createIndex({ score: -1 }); // index on score for sorting
    console.log("Connected to MongoDB and ready to store highscores.");
}).catch(err => console.error("MongoDB connection error:", err));

// Game state
let players = new Map();   // Map of playerId -> player object
let pellets = [];          // Array of pellet objects {x, y}
let nextPlayerId = 1;      // incremental player ID assignment

// Initialize pellets at random positions
function initPellets() {
    pellets = [];
    for (let i = 0; i < Constants.PELLET_COUNT; i++) {
        pellets.push({
            x: Math.random() * Constants.MAP_WIDTH,
            y: Math.random() * Constants.MAP_HEIGHT
        });
    }
}
initPellets();

// Utility: random spawn position for a new player (not too close to edges)
function getRandomSpawn() {
    const margin = 50;
    return {
        x: margin + Math.random() * (Constants.MAP_WIDTH - 2 * margin),
        y: margin + Math.random() * (Constants.MAP_HEIGHT - 2 * margin)
    };
}

// Utility: generate a random bright color for a cell
function getRandomColor() {
    const hue = Math.floor(Math.random() * 360);
    return `hsl(${hue}, 80%, 60%)`; // use HSL for random hue, bright color
}

// Handling new WebSocket connections
wss.on('connection', (ws) => {
    // To store this player's data once they join
    let player = null;
    ws.on('message', (data) => {
        let msg;
        try {
            msg = JSON.parse(data);
        } catch (e) {
            console.error('Received malformed message:', data);
            return;
        }
        if (msg.type === 'join') {
            // Handle new player joining
            const nickname = msg.name ? msg.name.substring(0, 15) : 'Player';
            const spawn = getRandomSpawn();
            player = {
                id: nextPlayerId++,
                name: nickname,
                x: spawn.x,
                y: spawn.y,
                radius: Constants.INITIAL_RADIUS,
                // dx, dy for movement direction (unit vector):
                dirX: 0,
                dirY: 0,
                color: getRandomColor(),
                score: Constants.INITIAL_RADIUS * Constants.INITIAL_RADIUS // score (mass) initially area of circle
            };
            players.set(player.id, player);
            ws.playerId = player.id; // attach id to socket for reference
            console.log(`Player ${player.name} (ID ${player.id}) joined at (${player.x.toFixed(0)}, ${player.y.toFixed(0)})`);

            // Send initial state to the new player
            const currentPlayers = Array.from(players.values()).map(p => ({
                id: p.id, name: p.name, x: p.x, y: p.y, radius: p.radius, color: p.color, score: p.score
            }));
            const initMsg = { 
                type: 'init', 
                id: player.id, 
                players: currentPlayers, 
                pellets: pellets 
            };
            // Include global highscores from DB (top 10)
            if (highscoreCollection) {
                highscoreCollection.find().sort({ score: -1 }).limit(10).toArray((err, docs) => {
                    if (!err && docs) {
                        initMsg.highscores = docs.map(doc => ({ name: doc.name, score: doc.score }));
                    }
                    ws.send(JSON.stringify(initMsg));
                });
            } else {
                ws.send(JSON.stringify(initMsg));
            }
        }
        else if (msg.type === 'input' && player) {
            // Handle movement input
            if (typeof msg.dx === 'number' && typeof msg.dy === 'number') {
                // Normalize direction vector just in case (should already be normalized from client)
                const mag = Math.hypot(msg.dx, msg.dy);
                if (mag > 0) {
                    player.dirX = msg.dx / mag;
                    player.dirY = msg.dy / mag;
                } else {
                    player.dirX = 0;
                    player.dirY = 0;
                }
            }
            // (We ignore any other data - client is not allowed to send position/size directly)
        }
        // Ignore other message types for now (e.g., chat or others if not implemented)
    });

    ws.on('close', () => {
        if (player) {
            console.log(`Player ${player.name} (ID ${player.id}) disconnected.`);
            players.delete(player.id);
        }
    });
});

// Game loop: runs at TICK_RATE to update game state and broadcast
setInterval(() => {
    // Game physics update
    players.forEach(player => {
        // Compute speed: smaller cells move faster, larger slower
        const speed = Math.max(Constants.MIN_SPEED, Constants.INITIAL_SPEED / player.radius);
        // Update position based on direction and speed
        player.x += player.dirX * speed;
        player.y += player.dirY * speed;
        // Keep within map bounds
        if (player.x < player.radius) player.x = player.radius;
        if (player.y < player.radius) player.y = player.radius;
        if (player.x > Constants.MAP_WIDTH - player.radius) player.x = Constants.MAP_WIDTH - player.radius;
        if (player.y > Constants.MAP_HEIGHT - player.radius) player.y = Constants.MAP_HEIGHT - player.radius;
    });
    // Collision detection – pellets
    players.forEach(player => {
        for (let i = 0; i < pellets.length; i++) {
            const px = pellets[i].x;
            const py = pellets[i].y;
            // If distance between player and pellet < (player radius), eat pellet
            if (Constants.dist(player.x, player.y, px, py) < player.radius) {
                // "Consume" pellet: increase player's area (mass)
                const oldArea = player.radius * player.radius;
                const pelletArea = Constants.PELLET_RADIUS * Constants.PELLET_RADIUS;
                const newArea = oldArea + pelletArea;
                player.radius = Math.sqrt(newArea);
                player.score = newArea; // score is proportional to area
                // Respawn pellet at new random position
                pellets[i].x = Math.random() * Constants.MAP_WIDTH;
                pellets[i].y = Math.random() * Constants.MAP_HEIGHT;
            }
        }
    });
    // Collision detection – players
    let eatenPlayers = [];
    players.forEach(playerA => {
        players.forEach(playerB => {
            if (playerA === playerB) return;
            if (playerA.radius < playerB.radius) {
                // Ensure playerA is the larger for simplicity by swapping if needed
                return;
            }
            // Now playerA is >= playerB in radius
            const dist = Constants.dist(playerA.x, playerA.y, playerB.x, playerB.y);
            if (dist < playerA.radius * 0.9) { 
                // We require a slight overlap threshold (90%) to ensure near-full engulf
                // If condition met, playerA eats playerB
                if (!eatenPlayers.includes(playerB.id)) {
                    eatenPlayers.push(playerB.id);
                    // Increase playerA's mass
                    const areaA = playerA.radius * playerA.radius;
                    const areaB = playerB.radius * playerB.radius;
                    const newAreaA = areaA + areaB;
                    playerA.radius = Math.sqrt(newAreaA);
                    playerA.score = newAreaA;
                    // Record death event for playerB
                    handlePlayerDeath(playerB);
                }
            }
        });
    });
    // Remove eaten players (they will be respawned in handlePlayerDeath)
    eatenPlayers.forEach(id => {
        players.delete(id);
    });
    // Broadcast state to all clients
    const stateUpdate = {
        type: 'update',
        players: Array.from(players.values()).map(p => ({
            id: p.id,
            name: p.name,
            x: p.x,
            y: p.y,
            radius: p.radius,
            color: p.color,
            score: Math.floor(p.score)
        })),
        pellets: pellets
    };
    const stateJson = JSON.stringify(stateUpdate);
    // Broadcast to every connected client
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(stateJson);
        }
    });
}, 1000 / Constants.TICK_RATE);

// Handle player death: record highscore and respawn
function handlePlayerDeath(player) {
    console.log(`Player ${player.name} (ID ${player.id}) was eaten. Final score: ${Math.floor(player.score)}`);
    // Check and update persistent high score
    if (highscoreCollection) {
        const finalScore = Math.floor(player.score);
        highscoreCollection.findOne({ name: player.name }, (err, doc) => {
            if (err) {
                console.error("DB error finding highscore:", err);
            } else {
                if (!doc || finalScore > doc.score) {
                    highscoreCollection.updateOne(
                        { name: player.name },
                        { $set: { name: player.name, score: finalScore } },
                        { upsert: true }
                    );
                }
            }
        });
    }
    // Respawn the player with initial stats at a new location
    const spawn = getRandomSpawn();
    player.x = spawn.x;
    player.y = spawn.y;
    player.radius = Constants.INITIAL_RADIUS;
    player.score = Constants.INITIAL_RADIUS * Constants.INITIAL_RADIUS;
    player.dirX = 0;
    player.dirY = 0;
    // Keep the same id, name, color.
    players.set(player.id, player);
}

// Start the HTTP/WebSocket server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});
