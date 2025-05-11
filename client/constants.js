/** 
 * File: shared/constants.js 
 * Shared game constants and helper functions. 
 * This file is loaded on the client via a <script> tag and on the server via require(). 
 */
(function(global) {
    const Constants = {
        // Canvas & World
        MAP_WIDTH: 2000,    // Width of the game world (px)
        MAP_HEIGHT: 2000,   // Height of the game world (px)
        // Player cell settings
        INITIAL_RADIUS: 10,  // Starting radius for players
        INITIAL_SPEED: 50,   // Base speed factor for smallest cells
        MIN_SPEED: 2,        // Minimum speed (for very large cells)
        // Pellet settings
        PELLET_COUNT: 100,    // Number of pellets in the world
        PELLET_RADIUS: 4,     // Radius of each pellet
        // Gameplay
        MAX_PLAYERS: 50,
        TICK_RATE: 30,       // Server update tick rate (30 Hz -> ~33ms per tick)
        INPUT_RATE: 20,      // Max input messages per second from client
        // Utility: calculate distance between two points
        dist(x1, y1, x2, y2) {
            return Math.hypot(x1 - x2, y1 - y2);
        }
    };
    // Export for Node.js and attach to global for browser
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = Constants;
    }
    if (typeof global.window !== 'undefined') {
        global.window.Constants = Constants;
    } else {
        // In Node (no window), optionally attach to globalThis
        global.Constants = Constants;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);
