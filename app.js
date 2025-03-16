// Game configuration
const config = {
    mazeSize: 10,
    wallHeight: 3,
    cellSize: 4,
    playerHeight: 1.7,
    playerSpeed: 0.08,
    runMultiplier: 1.5,
    flashlightIntensity: 1.5,
    flashlightDistance: 10,
    flashlightAngle: Math.PI / 6,
    flashlightColor: 0xffffaa,
    enemySpeed: 0.03,
    enemyDetectionRadius: 8,
    itemCount: 3,
    sanityDecreaseRate: 0.1,
    sanityDecreasePerEnemy: 0.3,
    sanityRecoveryRate: 0.05
};

// Game state
const state = {
    health: 100,
    sanity: 100,
    isGameStarted: false,
    isGameOver: false,
    isPlayerAlive: true,
    hasFlashlight: true,
    isFlashlightOn: false,
    isRunning: false,
    inventory: [],
    collectibles: [],
    enemies: [],
    goalReached: false,
    playerControls: {
        moveForward: false,
        moveBackward: false,
        moveLeft: false,
        moveRight: false
    },
    maze: [],
    exitPosition: { x: 0, z: 0 },
    playerPosition: { x: 0, z: 0 },
    messageQueue: [],
    currentMessage: null,
    messageTimer: null
};

// DOM elements
const canvas = document.getElementById('game-canvas');
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over');
const restartButton = document.getElementById('restart-button');
const healthBar = document.getElementById('health-bar');
const sanityBar = document.getElementById('sanity-bar');
const messageBox = document.getElementById('message-box');

// Three.js variables
let scene, camera, renderer;
let flashlight, ambientLight;
let playerObject, mazeObject;

// Initialize game
function init() {
    // Set up Three.js scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x202020);
    scene.fog = new THREE.FogExp2(0x000000, 0.07);

    // Set up camera
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 50);
    camera.position.y = config.playerHeight;

    // Set up renderer
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;

    // Add lighting
    ambientLight = new THREE.AmbientLight(0x999999); // Slightly dimmer ambient light
    scene.add(ambientLight);

    // Add flashlight
    flashlight = new THREE.SpotLight(
        config.flashlightColor,
        3.0,  // Increased intensity
        15,   // Increased distance
        Math.PI / 4,  // Wider angle
        0.5,
        1
    );

    // Clear collectibles array before adding new ones
    state.collectibles = [];

    flashlight.position.set(0, config.playerHeight, 0);
    flashlight.target.position.set(0, config.playerHeight, -1);
    flashlight.visible = false;
    scene.add(flashlight);
    scene.add(flashlight.target);

    // Create player object
    playerObject = new THREE.Group();
    playerObject.position.y = config.playerHeight;
    scene.add(playerObject);
    playerObject.add(camera);
    flashlight.target.position.z = -1;
    camera.add(flashlight);
    camera.add(flashlight.target);

    // Generate maze
    generateMaze();

    // Add enemies
    for (let i = 0; i < 3; i++) {
        addEnemy();
    }

    // Add collectibles - ONLY do this once
    for (let i = 0; i < config.itemCount; i++) {
        addCollectible();
    }

    // Initialize inventory UI
    updateInventoryUI();

    // Set up event listeners
    window.addEventListener('resize', onWindowResize);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointerlockchange', onPointerLockChange);

    // Hide start button and screen immediately
    startScreen.style.display = 'none';

    // Lock pointer when clicking on canvas
    canvas.addEventListener('click', () => {
        if (!state.isGameOver) {
            canvas.requestPointerLock();
        }
    });

    // Display initial message
    queueMessage("Find the 3 artifacts: Key, Medkit and Battery!");

    // Automatically start the game instead of waiting for button click
    state.isGameStarted = true;
    canvas.requestPointerLock();
    playSound('game_start');

    // Start the animation loop
    animate();
    // Initialize pointer lock
    initPointerLock();
}

// Generate maze
function generateMaze() {
    // Initialize maze with walls
    state.maze = [];
    for (let i = 0; i < config.mazeSize; i++) {
        state.maze[i] = [];
        for (let j = 0; j < config.mazeSize; j++) {
            state.maze[i][j] = {
                northWall: true,
                eastWall: true,
                visited: false
            };
        }
    }

    // Create maze using depth-first search
    const stack = [];
    const startX = Math.floor(Math.random() * config.mazeSize);
    const startZ = Math.floor(Math.random() * config.mazeSize);
    state.playerPosition = {
        x: startX * config.cellSize + config.cellSize / 2,
        z: startZ * config.cellSize + config.cellSize / 2
    };

    state.maze[startX][startZ].visited = true;
    stack.push({ x: startX, z: startZ });

    while (stack.length > 0) {
        const current = stack[stack.length - 1];
        const neighbors = getUnvisitedNeighbors(current.x, current.z);

        if (neighbors.length === 0) {
            stack.pop();
        } else {
            const next = neighbors[Math.floor(Math.random() * neighbors.length)];
            removeWall(current, next);
            state.maze[next.x][next.z].visited = true;
            stack.push(next);
        }
    }

    // Set exit position (furthest from start)
    let maxDistance = 0;
    for (let i = 0; i < config.mazeSize; i++) {
        for (let j = 0; j < config.mazeSize; j++) {
            const distance = Math.abs(i - startX) + Math.abs(j - startZ);
            if (distance > maxDistance) {
                maxDistance = distance;
                state.exitPosition = {
                    x: i * config.cellSize + config.cellSize / 2,
                    z: j * config.cellSize + config.cellSize / 2
                };
            }
        }
    }

    // Create maze geometry
    createMazeGeometry();

    // Position player
    playerObject.position.x = state.playerPosition.x;
    playerObject.position.z = state.playerPosition.z;
}

// Get unvisited neighbors for cell
function getUnvisitedNeighbors(x, z) {
    const neighbors = [];

    // North
    if (z > 0 && !state.maze[x][z - 1].visited) {
        neighbors.push({ x: x, z: z - 1, direction: 'north' });
    }

    // East
    if (x < config.mazeSize - 1 && !state.maze[x + 1][z].visited) {
        neighbors.push({ x: x + 1, z: z, direction: 'east' });
    }

    // South
    if (z < config.mazeSize - 1 && !state.maze[x][z + 1].visited) {
        neighbors.push({ x: x, z: z + 1, direction: 'south' });
    }

    // West
    if (x > 0 && !state.maze[x - 1][z].visited) {
        neighbors.push({ x: x - 1, z: z, direction: 'west' });
    }

    return neighbors;
}

// Remove wall between two cells
function removeWall(cell1, cell2) {
    if (cell1.z === cell2.z) {
        // East-West
        if (cell1.x < cell2.x) {
            state.maze[cell1.x][cell1.z].eastWall = false;
        } else {
            state.maze[cell2.x][cell2.z].eastWall = false;
        }
    } else {
        // North-South
        if (cell1.z < cell2.z) {
            state.maze[cell1.x][cell1.z + 1].northWall = false;
        } else {
            state.maze[cell2.x][cell2.z + 1].northWall = false;
        }
    }
}

// Fixed createMazeGeometry function
function createMazeGeometry() {
    // Remove old maze if exists
    if (mazeObject) {
        scene.remove(mazeObject);
    }

    mazeObject = new THREE.Group();

    // Create floor and ceiling
    const floorGeometry = new THREE.PlaneGeometry(
        config.mazeSize * config.cellSize,
        config.mazeSize * config.cellSize
    );
    const floorMaterial = new THREE.MeshStandardMaterial({
        color: 0x111111,
        roughness: 0.8,
        metalness: 0.2
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(
        (config.mazeSize * config.cellSize) / 2,
        0,
        (config.mazeSize * config.cellSize) / 2
    );
    floor.receiveShadow = true;
    mazeObject.add(floor);

    const ceilingGeometry = new THREE.PlaneGeometry(
        config.mazeSize * config.cellSize,
        config.mazeSize * config.cellSize
    );
    const ceilingMaterial = new THREE.MeshStandardMaterial({
        color: 0x080808,
        roughness: 0.9,
        metalness: 0.1
    });
    const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(
        (config.mazeSize * config.cellSize) / 2,
        config.wallHeight,
        (config.mazeSize * config.cellSize) / 2
    );
    mazeObject.add(ceiling);

    // Create wall geometry
    const wallGeometry = new THREE.BoxGeometry(config.cellSize, config.wallHeight, 0.1);
    const wallMaterial = new THREE.MeshStandardMaterial({
        color: 0x222222,
        roughness: 0.75,
        metalness: 0.25
    });

    // Add walls
    for (let i = 0; i < config.mazeSize; i++) {
        for (let j = 0; j < config.mazeSize; j++) {
            // North walls
            if (j > 0 && state.maze[i][j].northWall) {
                const wall = new THREE.Mesh(wallGeometry, wallMaterial);
                wall.position.set(
                    i * config.cellSize + config.cellSize / 2,
                    config.wallHeight / 2,
                    j * config.cellSize
                );
                wall.castShadow = true;
                wall.receiveShadow = true;
                mazeObject.add(wall);
            }

            // East walls
            if (i < config.mazeSize - 1 && state.maze[i][j].eastWall) {
                const wall = new THREE.Mesh(wallGeometry, wallMaterial);
                wall.rotation.y = Math.PI / 2;
                wall.position.set(
                    (i + 1) * config.cellSize,
                    config.wallHeight / 2,
                    j * config.cellSize + config.cellSize / 2
                );
                wall.castShadow = true;
                wall.receiveShadow = true;
                mazeObject.add(wall);
            }

            // Add south wall for last row
            if (j === config.mazeSize - 1) {
                const wall = new THREE.Mesh(wallGeometry, wallMaterial);
                wall.position.set(
                    i * config.cellSize + config.cellSize / 2,
                    config.wallHeight / 2,
                    (j + 1) * config.cellSize
                );
                wall.castShadow = true;
                wall.receiveShadow = true;
                mazeObject.add(wall);
            }

            // Add west wall for first column
            if (i === 0) {
                const wall = new THREE.Mesh(wallGeometry, wallMaterial);
                wall.rotation.y = Math.PI / 2;
                wall.position.set(
                    0,
                    config.wallHeight / 2,
                    j * config.cellSize + config.cellSize / 2
                );
                wall.castShadow = true;
                wall.receiveShadow = true;
                mazeObject.add(wall);
            }
        }
    }

    // Add exit marker
    const exitGeometry = new THREE.BoxGeometry(config.cellSize / 2, 0.1, config.cellSize / 2);
    const exitMaterial = new THREE.MeshStandardMaterial({
        color: 0x660000,
        emissive: 0x330000,
        roughness: 0.5,
        metalness: 0.5
    });
    const exit = new THREE.Mesh(exitGeometry, exitMaterial);
    exit.position.set(
        state.exitPosition.x,
        0.05,
        state.exitPosition.z
    );
    mazeObject.add(exit);

    scene.add(mazeObject);
}

// Add enemy to the game
function addEnemy() {
    // Find position away from player
    let x, z;
    do {
        x = Math.floor(Math.random() * config.mazeSize);
        z = Math.floor(Math.random() * config.mazeSize);
    } while (
        Math.abs(x * config.cellSize + config.cellSize / 2 - state.playerPosition.x) < config.cellSize * 3 ||
        Math.abs(z * config.cellSize + config.cellSize / 2 - state.playerPosition.z) < config.cellSize * 3
    );

    // Create enemy object
    const enemyGeometry = new THREE.SphereGeometry(0.5, 16, 16);
    const enemyMaterial = new THREE.MeshStandardMaterial({
        color: 0x000000,
        emissive: 0x330000,
        roughness: 0.1,
        metalness: 0.9
    });
    const enemyMesh = new THREE.Mesh(enemyGeometry, enemyMaterial);
    enemyMesh.position.set(
        x * config.cellSize + config.cellSize / 2,
        config.playerHeight,
        z * config.cellSize + config.cellSize / 2
    );
    enemyMesh.castShadow = true;

    // Add glowing eyes
    const eyeGeometry = new THREE.SphereGeometry(0.1, 8, 8);
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });

    const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    leftEye.position.set(0.2, 0.1, -0.3);
    enemyMesh.add(leftEye);

    const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
    rightEye.position.set(-0.2, 0.1, -0.3);
    enemyMesh.add(rightEye);

    // Store enemy data
    const enemy = {
        mesh: enemyMesh,
        position: { x: enemyMesh.position.x, z: enemyMesh.position.z },
        targetPosition: { x: enemyMesh.position.x, z: enemyMesh.position.z },
        state: 'idle', // idle, chasing, attacking
        lastPathUpdate: 0,
        path: [],
        attackCooldown: 0
    };

    state.enemies.push(enemy);
    scene.add(enemyMesh);
}

// Add collectible item
function addCollectible() {
    // Predefined positions to ensure artifacts are always placed in accessible locations
    const forcedPositions = [
        { x: 2, z: 2 },  // First item near starting area
        { x: 5, z: 5 },  // Second item in middle area
        { x: 8, z: 8 }   // Third item further in
    ];

    // Get position from our forced positions list based on how many collectibles we've already created
    // We need to check current collectibles length because we're only adding one at a time
    const posIndex = state.collectibles.length;

    // Safety check - don't proceed if we've already created all items
    if (posIndex >= forcedPositions.length) return;

    const position = forcedPositions[posIndex];
    const x = position.x;
    const z = position.z;

    // Create collectible object with enhanced visibility
    const collectibleGeometry = new THREE.BoxGeometry(0.8, 0.8, 0.8);
    const collectibleMaterial = new THREE.MeshStandardMaterial({
        color: 0xFFFF00,  // Bright yellow
        emissive: 0xFFFF00, // Increased emissive value for better visibility
        emissiveIntensity: 1.0, // Increased intensity
        roughness: 0.1,
        metalness: 0.9
    });
    const collectibleMesh = new THREE.Mesh(collectibleGeometry, collectibleMaterial);

    // Position the item in the world based on cell coordinates
    collectibleMesh.position.set(
        x * config.cellSize + config.cellSize / 2,
        1.0,  // Raise height to be more visible
        z * config.cellSize + config.cellSize / 2
    );

    collectibleMesh.rotation.y = Math.PI / 4;
    collectibleMesh.castShadow = true;

    // Add stronger glow effect
    const glowGeometry = new THREE.SphereGeometry(1.2, 16, 16);
    const glowMaterial = new THREE.MeshBasicMaterial({
        color: 0xFFFF00,
        transparent: true,
        opacity: 0.6 // Increased opacity for better visibility
    });
    const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
    collectibleMesh.add(glowMesh);

    // Add stronger point light to make the collectible more visible
    const itemLight = new THREE.PointLight(0xFFFF00, 2, 6); // Increased intensity and range
    itemLight.position.set(0, 0, 0);
    collectibleMesh.add(itemLight);

    // Store collectible data with the correct type assignment
    const collectible = {
        mesh: collectibleMesh,
        position: { x: collectibleMesh.position.x, z: collectibleMesh.position.z },
        collected: false,
        type: ['key', 'medkit', 'battery'][posIndex]  // Assign type based on index
    };

    state.collectibles.push(collectible);
    scene.add(collectibleMesh);

    console.log("Created collectible of type:", collectible.type);
    console.log("at position:", collectible.position);
}

// Handle window resize
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Handle keyboard input
function onKeyDown(event) {
    if (!state.isGameStarted || state.isGameOver) return;

    switch (event.code) {
        case 'KeyW':
            state.playerControls.moveForward = true;
            break;
        case 'KeyS':
            state.playerControls.moveBackward = true;
            break;
        case 'KeyA':
            state.playerControls.moveLeft = true;
            break;
        case 'KeyD':
            state.playerControls.moveRight = true;
            break;
        case 'KeyF':
            toggleFlashlight();
            break;
        case 'KeyE':
            interact();
            break;
        case 'ShiftLeft':
        case 'ShiftRight':
            state.isRunning = true;
            break;
    }
}

function onKeyUp(event) {
    if (!state.isGameStarted || state.isGameOver) return;

    switch (event.code) {
        case 'KeyW':
            state.playerControls.moveForward = false;
            break;
        case 'KeyS':
            state.playerControls.moveBackward = false;
            break;
        case 'KeyA':
            state.playerControls.moveLeft = false;
            break;
        case 'KeyD':
            state.playerControls.moveRight = false;
            break;
        case 'ShiftLeft':
        case 'ShiftRight':
            state.isRunning = false;
            break;
    }
}

// Handle mouse movement for camera
function onMouseMove(event) {
    if (!state.isGameStarted || state.isGameOver) return;

    // Check if pointer is locked
    if (document.pointerLockElement !== canvas) {
        canvas.requestPointerLock();
        return;
    }

    const movementX = event.movementX || 0;
    const movementY = event.movementY || 0;

    // Rotate player object (which contains the camera)
    playerObject.rotation.y -= movementX * 0.002;

    // Limit vertical camera movement
    const newRotationX = camera.rotation.x - movementY * 0.002;
    camera.rotation.x = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, newRotationX));
}

// Enhanced pointer lock initialization
function initPointerLock() {
    canvas.addEventListener('click', () => {
        if (!state.isGameOver) {
            canvas.requestPointerLock();
        }
    });

    // Add event listener for pointer lock changes
    document.addEventListener('pointerlockchange', onPointerLockChange);
}

// Enhance pointer lock change handler
function onPointerLockChange() {
    if (document.pointerLockElement === canvas) {
        console.log("Pointer locked");
        // Enable mouse movement controls
    } else {
        console.log("Pointer unlocked");
        // Could add pause menu here
    }
}

// Toggle flashlight
function toggleFlashlight() {
    if (!state.hasFlashlight) return;

    state.isFlashlightOn = !state.isFlashlightOn;
    flashlight.visible = state.isFlashlightOn;

    if (state.isFlashlightOn) {
        playSound('flashlight_on');
    } else {
        playSound('flashlight_off');
    }
}

// Interact with environment
function interact() {
    // Check for collectibles
    for (const collectible of state.collectibles) {
        if (collectible.collected) continue;

        const dx = collectible.position.x - playerObject.position.x;
        const dz = collectible.position.z - playerObject.position.z;
        const distance = Math.sqrt(dx * dx + dz * dz);

        if (distance < 1) {
            collectItem(collectible);
            return;
        }
    }

    // Check if at exit
    const dx = state.exitPosition.x - playerObject.position.x;
    const dz = state.exitPosition.z - playerObject.position.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    if (distance < 1.5) {
        if (state.inventory.length >= config.itemCount) {
            // Win condition
            queueMessage("You've escaped the shadow corridor... for now.");
            state.goalReached = true;
            setTimeout(() => {
                state.isGameOver = true;
                gameOverScreen.querySelector('.game-over-text').textContent = "ESCAPED";
                gameOverScreen.classList.add('visible');
            }, 3000);
        } else {
            queueMessage(`Find ${config.itemCount - state.inventory.length} more artifacts to escape.`);
        }
    }
}

// Collect item
function collectItem(collectible) {
    collectible.collected = true;
    scene.remove(collectible.mesh);

    // Add to inventory
    state.inventory.push(collectible.type);

    // Ensure inventory UI is updated
    updateInventoryUI();

    console.log("Item collected:", collectible.type);
    console.log("Inventory now contains:", state.inventory);

    switch (collectible.type) {
        case 'key':
            queueMessage("You found a mysterious key.");
            playSound('collect_key');
            break;
        case 'medkit':
            queueMessage("You found a first aid kit. Health restored.");
            state.health = Math.min(100, state.health + 40);
            updateHealthUI();
            playSound('collect_health');
            break;
        case 'battery':
            queueMessage("You found fresh batteries. Flashlight power increased.");
            config.flashlightIntensity += 0.5;
            config.flashlightDistance += 2;
            flashlight.intensity = config.flashlightIntensity;
            flashlight.distance = config.flashlightDistance;
            playSound('collect_battery');
            break;
    }
}


// Update inventory UI
function updateInventoryUI() {
    const itemSlots = document.querySelectorAll('.item-slot');

    for (let i = 0; i < itemSlots.length; i++) {
        itemSlots[i].innerHTML = '';

        if (i < state.inventory.length) {
            const itemType = state.inventory[i];
            const itemIcon = document.createElement('div');

            // Make item icons more visible
            itemIcon.style.fontSize = '2em';
            itemIcon.style.color = '#ffffff';
            itemIcon.style.textShadow = '0 0 5px #88f';

            switch (itemType) {
                case 'key':
                    itemIcon.textContent = '🔑';
                    break;
                case 'medkit':
                    itemIcon.textContent = '🩹';
                    break;
                case 'battery':
                    itemIcon.textContent = '🔋';
                    break;
            }

            itemSlots[i].appendChild(itemIcon);
        } else {
            // Add empty slot indicators
            const emptySlot = document.createElement('div');
            emptySlot.textContent = '⬚';
            emptySlot.style.fontSize = '2em';
            emptySlot.style.color = '#444444';
            itemSlots[i].appendChild(emptySlot);
        }
    }
}

// Update health UI
function updateHealthUI() {
    healthBar.style.width = `${state.health}%`;
    sanityBar.style.width = `${state.sanity}%`;
}

// Display message
function queueMessage(text, duration = 5000) {
    state.messageQueue.push({ text, duration });

    if (!state.currentMessage) {
        showNextMessage();
    }
}

function showNextMessage() {
    if (state.messageQueue.length === 0) {
        state.currentMessage = null;
        messageBox.classList.remove('visible');
        return;
    }

    state.currentMessage = state.messageQueue.shift();
    messageBox.textContent = state.currentMessage.text;
    messageBox.classList.add('visible');

    if (state.messageTimer) {
        clearTimeout(state.messageTimer);
    }

    state.messageTimer = setTimeout(() => {
        messageBox.classList.remove('visible');
        setTimeout(showNextMessage, 500);
    }, state.currentMessage.duration);
}

// Check for collisions
function checkCollisions(x, z) {
    // Convert position to maze indices
    const cellX = Math.floor(x / config.cellSize);
    const cellZ = Math.floor(z / config.cellSize);

    // Check bounds
    if (cellX < 0 || cellX >= config.mazeSize || cellZ < 0 || cellZ >= config.mazeSize) {
        return true;
    }

    // Get relative position within cell
    const relX = x - cellX * config.cellSize;
    const relZ = z - cellZ * config.cellSize;

    // Check wall collisions
    const wallThreshold = 0.3;

    // North wall
    if (relZ < wallThreshold && cellZ > 0 && state.maze[cellX][cellZ].northWall) {
        return true;
    }

    // South wall
    if (relZ > config.cellSize - wallThreshold &&
        cellZ < config.mazeSize - 1 &&
        state.maze[cellX][cellZ + 1].northWall) {
        return true;
    }

    // East wall
    if (relX > config.cellSize - wallThreshold &&
        cellX < config.mazeSize - 1 &&
        state.maze[cellX][cellZ].eastWall) {
        return true;
    }

    // West wall
    if (relX < wallThreshold &&
        cellX > 0 &&
        state.maze[cellX - 1][cellZ].eastWall) {
        return true;
    }

    return false;
}

// Update enemy movement
function updateEnemies(deltaTime) {
    for (const enemy of state.enemies) {
        // Calculate distance to player
        const dx = playerObject.position.x - enemy.position.x;
        const dz = playerObject.position.z - enemy.position.z;
        const distanceToPlayer = Math.sqrt(dx * dx + dz * dz);

        // Update enemy state
        if (distanceToPlayer < 1.5) {
            enemy.state = 'attacking';
        } else if (distanceToPlayer < config.enemyDetectionRadius && hasLineOfSight(enemy.position, playerObject.position)) {
            enemy.state = 'chasing';
        } else {
            enemy.state = 'idle';
        }

        // Handle enemy behavior based on state
        switch (enemy.state) {
            case 'idle':
                // Wander randomly
                if (Date.now() - enemy.lastPathUpdate > 3000) {
                    const randomAngle = Math.random() * Math.PI * 2;
                    const randomDistance = 1 + Math.random() * 3;
                    enemy.targetPosition = {
                        x: enemy.position.x + Math.cos(randomAngle) * randomDistance,
                        z: enemy.position.z + Math.sin(randomAngle) * randomDistance
                    };

                    // Ensure target is within maze bounds
                    const cellX = Math.floor(enemy.targetPosition.x / config.cellSize);
                    const cellZ = Math.floor(enemy.targetPosition.z / config.cellSize);
                    if (cellX < 0 || cellX >= config.mazeSize || cellZ < 0 || cellZ >= config.mazeSize) {
                        enemy.targetPosition = enemy.position;
                    }

                    enemy.lastPathUpdate = Date.now();
                }
                break;

            case 'chasing':
                // Chase player
                if (Date.now() - enemy.lastPathUpdate > 500) {
                    enemy.targetPosition = {
                        x: playerObject.position.x,
                        z: playerObject.position.z
                    };
                    enemy.lastPathUpdate = Date.now();
                }
                break;

            case 'attacking':
                // Attack player
                if (enemy.attackCooldown <= 0) {
                    state.health -= 10;
                    state.sanity -= 15;
                    updateHealthUI();

                    if (state.health <= 0) {
                        gameOver();
                    }

                    playSound('player_hurt');
                    enemy.attackCooldown = 1;
                } else {
                    enemy.attackCooldown -= deltaTime;
                }
                break;
        }

        // Move enemy towards target
        if (enemy.state === 'idle' || enemy.state === 'chasing') {
            const dirX = enemy.targetPosition.x - enemy.position.x;
            const dirZ = enemy.targetPosition.z - enemy.position.z;
            const length = Math.sqrt(dirX * dirX + dirZ * dirZ);

            if (length > 0.1) {
                const normalizedDirX = dirX / length;
                const normalizedDirZ = dirZ / length;

                // Calculate new position
                const speed = enemy.state === 'chasing' ? config.enemySpeed * 1.5 : config.enemySpeed;
                const newX = enemy.position.x + normalizedDirX * speed;
                const newZ = enemy.position.z + normalizedDirZ * speed;

                // Check for collisions
                if (!checkCollisions(newX, newZ)) {
                    enemy.position.x = newX;
                    enemy.position.z = newZ;
                    enemy.mesh.position.x = newX;
                    enemy.mesh.position.z = newZ;

                    // Make the enemy face movement direction
                    enemy.mesh.rotation.y = Math.atan2(normalizedDirX, normalizedDirZ);
                }
            }
        }

        // Update enemy mesh animation
        const hoverHeight = Math.sin(Date.now() * 0.003) * 0.1;
        enemy.mesh.position.y = config.playerHeight + hoverHeight;

        // Affect player sanity when enemy is close
        if (distanceToPlayer < config.enemyDetectionRadius) {
            const sanityDecrease = config.sanityDecreasePerEnemy * deltaTime * (1 - distanceToPlayer / config.enemyDetectionRadius);
            state.sanity = Math.max(0, state.sanity - sanityDecrease);
            updateHealthUI();
        }
    }
}

// Check if there's line of sight between two positions
function hasLineOfSight(pos1, pos2) {
    const dirX = pos2.x - pos1.x;
    const dirZ = pos2.z - pos1.z;
    const distance = Math.sqrt(dirX * dirX + dirZ * dirZ);

    const steps = Math.ceil(distance * 2); // Twice as many steps as distance
    const stepX = dirX / steps;
    const stepZ = dirZ / steps;

    for (let i = 1; i < steps; i++) {
        const x = pos1.x + stepX * i;
        const z = pos1.z + stepZ * i;

        if (checkCollisions(x, z)) {
            return false;
        }
    }

    return true;
}

// Play sound (mock function)
function playSound(soundName) {
    // In a real game, you would play actual sounds here
    console.log(`Playing sound: ${soundName}`);
}

// Start game
function startGame() {
    startScreen.style.display = 'none';
    state.isGameStarted = true;
    canvas.requestPointerLock();
    playSound('game_start');
}

// Restart game
function restartGame() {
    location.reload(); // Simple reload for demo
}

// Game over
function gameOver() {
    state.isPlayerAlive = false;
    state.isGameOver = true;
    gameOverScreen.querySelector('.game-over-text').textContent = "YOU DIED";
    gameOverScreen.classList.add('visible');
    playSound('game_over');
}

// Animation loop
let lastTime = 0;
function animate(currentTime) {
    requestAnimationFrame(animate);

    // Calculate time difference for smooth animations
    const deltaTime = (currentTime - lastTime) / 1000;
    lastTime = currentTime;

    if (!state.isGameStarted || state.isGameOver) return;

    // Update player movement
    if (state.isPlayerAlive) {
        // Calculate movement direction relative to camera orientation
        const moveSpeed = config.playerSpeed * (state.isRunning ? config.runMultiplier : 1);
        let moveX = 0;
        let moveZ = 0;

        if (state.playerControls.moveForward) {
            moveX -= Math.sin(playerObject.rotation.y) * moveSpeed;
            moveZ -= Math.cos(playerObject.rotation.y) * moveSpeed;
        }

        if (state.playerControls.moveBackward) {
            moveX += Math.sin(playerObject.rotation.y) * moveSpeed;
            moveZ += Math.cos(playerObject.rotation.y) * moveSpeed;
        }

        if (state.playerControls.moveLeft) {
            moveX -= Math.sin(playerObject.rotation.y + Math.PI / 2) * moveSpeed;
            moveZ -= Math.cos(playerObject.rotation.y + Math.PI / 2) * moveSpeed;
        }

        if (state.playerControls.moveRight) {
            moveX -= Math.sin(playerObject.rotation.y - Math.PI / 2) * moveSpeed;
            moveZ -= Math.cos(playerObject.rotation.y - Math.PI / 2) * moveSpeed;
        }

        // Normalize diagonal movement
        if (moveX !== 0 && moveZ !== 0) {
            const length = Math.sqrt(moveX * moveX + moveZ * moveZ);
            moveX /= length;
            moveZ /= length;
            moveX *= moveSpeed;
            moveZ *= moveSpeed;
        }

        // Check collisions and update player position
        const newX = playerObject.position.x + moveX;
        const newZ = playerObject.position.z + moveZ;

        if (!checkCollisions(newX, playerObject.position.z)) {
            playerObject.position.x = newX;
            state.playerPosition.x = newX;
        }

        if (!checkCollisions(playerObject.position.x, newZ)) {
            playerObject.position.z = newZ;
            state.playerPosition.z = newZ;
        }

        // Update flashlight position and direction
        flashlight.position.set(0, 0, 0);
        flashlight.target.position.set(0, 0, -1);

        // Update collectibles animation
        for (const collectible of state.collectibles) {
            if (!collectible.collected) {
                collectible.mesh.rotation.y += deltaTime * 2;
                collectible.mesh.position.y = 0.5 + Math.sin(currentTime * 0.002) * 0.1;
            }
        }

        // Update enemies
        updateEnemies(deltaTime);

        // Update sanity over time
        if (state.isFlashlightOn) {
            state.sanity = Math.min(100, state.sanity + config.sanityRecoveryRate * deltaTime);
        } else {
            state.sanity = Math.max(0, state.sanity - config.sanityDecreaseRate * deltaTime);
        }

        // Sanity effects
        if (state.sanity < 30) {
            const distortionAmount = (30 - state.sanity) / 30;

            // Visual distortion
            camera.fov = 75 + Math.sin(currentTime * 0.001) * distortionAmount * 5;
            camera.updateProjectionMatrix();

            // Vignette effect could be added here

            if (state.sanity < 10 && Math.random() < 0.0008) {
                // Random hallucination
                const directionAngle = Math.random() * Math.PI * 2;
                const distance = 3 + Math.random() * 2;

                // Calculate position
                const hallX = playerObject.position.x + Math.sin(directionAngle) * distance;
                const hallZ = playerObject.position.z + Math.cos(directionAngle) * distance;

                // Create enemy-like object that disappears
                const hallGeometry = new THREE.SphereGeometry(0.5, 16, 16);
                const hallMaterial = new THREE.MeshBasicMaterial({
                    color: 0x330000,
                    transparent: true,
                    opacity: 0.7
                });

                const hallucination = new THREE.Mesh(hallGeometry, hallMaterial);
                hallucination.position.set(hallX, config.playerHeight, hallZ);
                scene.add(hallucination);

                // Remove after a short time
                setTimeout(() => {
                    scene.remove(hallucination);
                }, 500 + Math.random() * 1000);

                // Play sound
                playSound('hallucination');
            }
        } else {
            camera.fov = 75;
            camera.updateProjectionMatrix();
        }

        updateHealthUI();

        // Check if reached the exit with all collectibles
        if (state.inventory.length >= config.itemCount) {
            const dx = state.exitPosition.x - playerObject.position.x;
            const dz = state.exitPosition.z - playerObject.position.z;
            const distance = Math.sqrt(dx * dx + dz * dz);

            if (distance < 1.5 && !state.goalReached) {
                state.goalReached = true;
                queueMessage("You've escaped the shadow corridor... for now.");

                setTimeout(() => {
                    state.isGameOver = true;
                    gameOverScreen.querySelector('.game-over-text').textContent = "ESCAPED";
                    gameOverScreen.classList.add('visible');
                }, 3000);
            }
        }
    }

    // Render scene
    renderer.render(scene, camera);
}

// Initialize the game
init();