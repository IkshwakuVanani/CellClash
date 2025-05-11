/** 
 * File: client/game.js 
 * Main client-side game logic for Cell Clash.
 */
(() => {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const startScreen = document.getElementById('start-screen');
    const nicknameInput = document.getElementById('nickname');
    const playBtn = document.getElementById('playBtn');
    const leaderboardUI = document.getElementById('leaderboard-list');
    const highscoreUI = document.getElementById('highscore-list');
    let socket;              // WebSocket connection
    let playerId = null;     // our player ID (assigned by server)
    let players = {};        // map of playerId -> player state (including our own)
    let pellets = [];        // array of pellet positions
    let animationFrameId;    // for canceling the render loop if needed

    // Game state for rendering
    let cameraX = 0, cameraY = 0, cameraScale = 1;
    let lastRenderTime = performance.now();

    // Helper: adjust canvas size to full window
    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resizeCanvas);

    // Initialize connection after clicking Play
    playBtn.onclick = () => {
        const name = nicknameInput.value.trim() || 'Unnamed';
        startGame(name);
    };

    function startGame(nickname) {
        // Hide start screen, show game canvas and UI
        startScreen.style.display = 'none';
        canvas.style.display = 'block';
        document.getElementById('game-ui').style.display = 'block';
        resizeCanvas();

        // Connect to WebSocket server (assume same host/port for simplicity)
        socket = new WebSocket(`ws://${window.location.host}`);
        socket.binaryType = 'arraybuffer'; // we'll send/receive JSON text, but just in case

        // When connection opens, send join message with nickname
        socket.onopen = () => {
            socket.send(JSON.stringify({ type: 'join', name: nickname }));
        };

        // Handle messages from server
        socket.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            switch(msg.type) {
                case 'init': {
                    // Initial game state from server
                    playerId = msg.id;
                    // Setup current players
                    players = {};
                    msg.players.forEach(p => {
                        players[p.id] = p;
                    });
                    // Setup pellets
                    pellets = msg.pellets;
                    // Populate all-time highscore list if provided
                    if (msg.highscores) {
                        highscoreUI.innerHTML = '';
                        msg.highscores.forEach(rec => {
                            const li = document.createElement('li');
                            li.textContent = `${rec.name}: ${rec.score}`;
                            highscoreUI.appendChild(li);
                        });
                    }
                    // Start the rendering loop
                    lastRenderTime = performance.now();
                    requestAnimationFrame(renderLoop);
                    break;
                }
                case 'update': {
                    // Periodic game state update
                    // Update all players
                    msg.players.forEach(p => {
                        if (!players[p.id]) {
                            // New player joined (not in our state yet)
                            players[p.id] = p;
                        } else {
                            // Update existing player state
                            players[p.id].x = p.x;
                            players[p.id].y = p.y;
                            players[p.id].radius = p.radius;
                        }
                        players[p.id].name = p.name;
                        players[p.id].score = p.score;
                        players[p.id].color = p.color;
                    });
                    // Remove players that are no longer present (e.g., disconnected)
                    const currentIDs = msg.players.map(p => p.id);
                    for (let id in players) {
                        if (!currentIDs.includes(Number(id))) {
                            delete players[id];
                        }
                    }
                    // Update pellets positions
                    pellets = msg.pellets;
                    // Update leaderboard UI 
                    updateLeaderboard();
                    break;
                }
                case 'death': {
                    // (Optional) handle death message if server sends one
                    // In this implementation, we respawn immediately via update, so may not use this.
                    break;
                }
                // ... handle other message types like chat or others if implemented
            }
        };

        socket.onclose = () => {
            console.log('Disconnected from server');
            cancelAnimationFrame(animationFrameId);
            // Could display a message or reconnect option
        };

        // Capture mouse movement to send input
        setupInputHandling();
    }

    // Update the in-game leaderboard UI showing top 10 players
    function updateLeaderboard() {
        // Sort players by score (mass), descending
        const sorted = Object.values(players).sort((a, b) => b.score - a.score);
        leaderboardUI.innerHTML = '';
        for (let i = 0; i < Math.min(sorted.length, 10); i++) {
            const p = sorted[i];
            const li = document.createElement('li');
            li.textContent = `${p.name}: ${Math.floor(p.score)}`;
            if (p.id === playerId) {
                // Highlight our own name
                li.style.fontWeight = 'bold';
                li.style.color = '#0f0';
            }
            leaderboardUI.appendChild(li);
        }
    }

    // Throttle and send mouse input to server
    function setupInputHandling() {
        let lastInputTime = 0;
        // track current mouse position relative to center
        let mouseX = canvas.width / 2;
        let mouseY = canvas.height / 2;
        canvas.addEventListener('mousemove', (e) => {
            // Update mouseX, mouseY relative to canvas center
            const rect = canvas.getBoundingClientRect();
            mouseX = e.clientX - rect.left;
            mouseY = e.clientY - rect.top;
            // Throttle the sending of input
            const now = Date.now();
            const minInterval = 1000 / Constants.INPUT_RATE; // e.g., 50ms for 20 Hz
            if (now - lastInputTime < minInterval) {
                return; // too soon, skip this event
            }
            lastInputTime = now;
            sendDirection();
        });
        // Also send direction periodically in case mousemove events are infrequent (e.g., if holding steady)
        setInterval(() => {
            sendDirection();
        }, 1000 / Constants.INPUT_RATE);

        function sendDirection() {
            if (!socket || socket.readyState !== WebSocket.OPEN) return;
            // Calculate direction vector in world coordinates
            // We assume camera is centered on our player. So direction in screen = direction in world.
            const dx = mouseX - canvas.width / 2;
            const dy = mouseY - canvas.height / 2;
            // Normalize direction vector to unit length
            const dist = Math.hypot(dx, dy);
            let input = { type: 'input', dx: 0, dy: 0 };
            if (dist > 0) {
                input.dx = dx / dist;
                input.dy = dy / dist;
            }
            socket.send(JSON.stringify(input));
        }
    }

    // Rendering loop: draw the game each animation frame (60 FPS if possible)
    function renderLoop(timestamp) {
        animationFrameId = requestAnimationFrame(renderLoop);
        const dt = (timestamp - lastRenderTime) / 1000; // delta time in seconds
        lastRenderTime = timestamp;
        if (!players[playerId]) {
            return; // If our player is not in game (e.g., not yet initialized), skip drawing
        }
        // Update camera to follow our player
        const me = players[playerId];
        // Smoothly move camera towards player position (for a slight easing effect)
        cameraX = me.x;
        cameraY = me.y;
        // Scale based on player size: bigger cell -> zoom out more
        cameraScale = Math.max(0.1, Constants.INITIAL_RADIUS / me.radius);
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // Save context state and apply camera transform
        ctx.save();
        // Translate to center, scale for zoom, then translate world so that player is at center
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.scale(cameraScale, cameraScale);
        ctx.translate(-cameraX, -cameraY);
        // Draw background (optional grid or boundaries)
        // Here we could draw a boundary box to indicate map edges:
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, Constants.MAP_WIDTH, Constants.MAP_HEIGHT);
        // Draw pellets
        ctx.fillStyle = '#888'; // pellets gray color
        pellets.forEach(pt => {
            ctx.beginPath();
            // Pellets can be drawn as squares (pixel art style) or small circles:
            // Option 1: square (pixel-like)
            ctx.fillRect(pt.x - Constants.PELLET_RADIUS, pt.y - Constants.PELLET_RADIUS, Constants.PELLET_RADIUS * 2, Constants.PELLET_RADIUS * 2);
            // Option 2: circle
            // ctx.arc(pt.x, pt.y, Constants.PELLET_RADIUS, 0, 2*Math.PI);
            // ctx.fill();
        });
        // Draw players' cells
        const now = Date.now();
        for (let id in players) {
            const p = players[id];
            const x = p.x;
            const y = p.y;
            const r = p.radius;
            // Choose fill color
            ctx.fillStyle = p.color || '#0f0';
            // Draw glowing cell: set shadow for glow effect
            ctx.save();
            ctx.shadowColor = ctx.fillStyle;
            ctx.shadowBlur = 20;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, 2 * Math.PI);
            ctx.fill();
            ctx.restore();
            // Draw an outline around the cell (optional, for contrast)
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.stroke();
            // Draw player's nickname at cell center
            ctx.fillStyle = '#fff';
            ctx.font = `${Math.max(12, r * 0.8)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(p.name, x, y);
            // Pulsing effect   
            let pulse = 0.05 * p.radius * Math.sin(now/200 + p.id);
            let drawRadius = p.radius + pulse;
            ctx.arc(x, y, drawRadius, 0, 2*Math.PI);

        }
        ctx.restore();
        // The scene is drawn; at this point, requestAnimationFrame will loop again.
        // (We already called it at the start of this function)
    }
})();
