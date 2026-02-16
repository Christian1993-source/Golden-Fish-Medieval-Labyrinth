(function () {
  const CELL_SIZE = 20;

  const DIRS = [
    { dx: 1, dy: 0, code: 'R' },
    { dx: -1, dy: 0, code: 'L' },
    { dx: 0, dy: 1, code: 'D' },
    { dx: 0, dy: -1, code: 'U' }
  ];

  function seededRandom(seed) {
    let t = seed >>> 0;
    return function () {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  function createGrid(width, height, fillValue) {
    return Array.from({ length: height }, function () {
      return Array(width).fill(fillValue);
    });
  }

  function pickWeighted(items, rng) {
    let sum = 0;
    items.forEach(function (item) {
      sum += item.weight;
    });

    let ticket = rng() * sum;
    for (let i = 0; i < items.length; i += 1) {
      ticket -= items[i].weight;
      if (ticket <= 0) {
        return items[i];
      }
    }

    return items[items.length - 1];
  }

  function carvePerfectMaze(gridWidth, gridHeight, seed, profile) {
    const rng = seededRandom(seed);
    const open = createGrid(gridWidth, gridHeight, false);

    const nodesW = Math.floor((gridWidth - 1) / 2);
    const nodesH = Math.floor((gridHeight - 1) / 2);
    const visited = createGrid(nodesW, nodesH, false);

    const stack = [{ x: 0, y: 0, dir: null }];
    visited[0][0] = true;
    open[1][1] = true;

    while (stack.length > 0) {
      const current = stack[stack.length - 1];
      const options = [];

      DIRS.forEach(function (dir) {
        const nx = current.x + dir.dx;
        const ny = current.y + dir.dy;

        if (nx < 0 || ny < 0 || nx >= nodesW || ny >= nodesH) {
          return;
        }

        if (visited[ny][nx]) {
          return;
        }

        let weight = dir.dx !== 0 ? profile.biasX : profile.biasY;
        if (current.dir && current.dir.code === dir.code) {
          weight *= profile.straightness;
        }

        options.push({ nx, ny, dir, weight });
      });

      if (options.length === 0) {
        stack.pop();
        continue;
      }

      const chosen = pickWeighted(options, rng);

      const cx = 1 + current.x * 2;
      const cy = 1 + current.y * 2;
      const tx = 1 + chosen.nx * 2;
      const ty = 1 + chosen.ny * 2;

      open[cy + Math.sign(ty - cy)][cx + Math.sign(tx - cx)] = true;
      open[ty][tx] = true;

      visited[chosen.ny][chosen.nx] = true;
      stack.push({ x: chosen.nx, y: chosen.ny, dir: chosen.dir });
    }

    return { open, rng };
  }

  function addLoops(open, rng, amount) {
    const width = open[0].length;
    const height = open.length;

    for (let i = 0; i < amount; i += 1) {
      const x = 1 + Math.floor(rng() * (width - 2));
      const y = 1 + Math.floor(rng() * (height - 2));

      if (open[y][x]) {
        continue;
      }

      const horizontalBridge = open[y][x - 1] && open[y][x + 1];
      const verticalBridge = open[y - 1][x] && open[y + 1][x];

      if (horizontalBridge || verticalBridge) {
        open[y][x] = true;
      }
    }
  }

  function carveRoom(open, x, y, width, height) {
    for (let yy = y; yy < y + height; yy += 1) {
      for (let xx = x; xx < x + width; xx += 1) {
        if (yy > 0 && xx > 0 && yy < open.length - 1 && xx < open[0].length - 1) {
          open[yy][xx] = true;
        }
      }
    }
  }

  function addChambers(open, rng, amount, minSize, maxSize) {
    const width = open[0].length;
    const height = open.length;

    for (let i = 0; i < amount; i += 1) {
      const roomW = minSize + Math.floor(rng() * (maxSize - minSize + 1));
      const roomH = minSize + Math.floor(rng() * (maxSize - minSize + 1));
      const x = 2 + Math.floor(rng() * Math.max(1, width - roomW - 3));
      const y = 2 + Math.floor(rng() * Math.max(1, height - roomH - 3));
      carveRoom(open, x, y, roomW, roomH);
    }
  }

  function addRuneCross(open, rng) {
    const width = open[0].length;
    const height = open.length;
    const midX = Math.floor(width / 2);
    const midY = Math.floor(height / 2);

    for (let x = 2; x < width - 2; x += 1) {
      if (rng() > 0.18) open[midY][x] = true;
    }

    for (let y = 2; y < height - 2; y += 1) {
      if (rng() > 0.18) open[y][midX] = true;
    }
  }

  function addSerpentCuts(open, rng, bands) {
    const width = open[0].length;
    const height = open.length;

    for (let band = 0; band < bands; band += 1) {
      const baseY = 2 + Math.floor((height - 4) * ((band + 1) / (bands + 1)));
      let y = baseY;

      for (let x = 2; x < width - 2; x += 1) {
        if (rng() > 0.22) {
          open[y][x] = true;
        }

        if (rng() > 0.66) {
          y += rng() > 0.5 ? 1 : -1;
          y = Math.max(2, Math.min(height - 3, y));
        }
      }
    }
  }

  function addCircularRelics(open, rng) {
    const width = open[0].length;
    const height = open.length;
    const cx = Math.floor(width / 2);
    const cy = Math.floor(height / 2);
    const maxR = Math.min(width, height) * 0.42;

    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > maxR) {
          open[y][x] = false;
        }
      }
    }

    [0.72, 0.55, 0.37].forEach(function (factor, idx) {
      const radius = maxR * factor;
      for (let angle = 0; angle < Math.PI * 2; angle += 0.03) {
        const blockedSector = idx === 0 ? angle > 0.8 && angle < 1.7 : idx === 1 ? angle > 3.3 && angle < 4.1 : angle > 5.2 && angle < 5.8;
        if (blockedSector) {
          continue;
        }
        const x = Math.round(cx + Math.cos(angle) * radius);
        const y = Math.round(cy + Math.sin(angle) * radius);
        if (x > 1 && y > 1 && x < width - 2 && y < height - 2 && rng() > 0.08) {
          open[y][x] = true;
        }
      }
    });
  }

  function normalizeBorders(open) {
    const width = open[0].length;
    const height = open.length;

    for (let x = 0; x < width; x += 1) {
      open[0][x] = false;
      open[height - 1][x] = false;
    }

    for (let y = 0; y < height; y += 1) {
      open[y][0] = false;
      open[y][width - 1] = false;
    }

    open[1][1] = true;
  }

  function bfs(open, start) {
    const width = open[0].length;
    const height = open.length;
    const dist = createGrid(width, height, -1);
    const prev = createGrid(width, height, null);

    const queue = [{ x: start.x, y: start.y }];
    let head = 0;
    dist[start.y][start.x] = 0;

    while (head < queue.length) {
      const current = queue[head];
      head += 1;

      for (let i = 0; i < DIRS.length; i += 1) {
        const nextX = current.x + DIRS[i].dx;
        const nextY = current.y + DIRS[i].dy;

        if (nextX < 1 || nextY < 1 || nextX >= width - 1 || nextY >= height - 1) {
          continue;
        }

        if (!open[nextY][nextX] || dist[nextY][nextX] !== -1) {
          continue;
        }

        dist[nextY][nextX] = dist[current.y][current.x] + 1;
        prev[nextY][nextX] = { x: current.x, y: current.y };
        queue.push({ x: nextX, y: nextY });
      }
    }

    return { dist, prev };
  }

  function pruneUnreachableFromStart(open, dist) {
    const width = open[0].length;
    const height = open.length;

    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        if (open[y][x] && dist[y][x] < 0) {
          open[y][x] = false;
        }
      }
    }
  }

  function findGoalNearRight(open, dist) {
    const width = open[0].length;
    const height = open.length;

    let best = null;
    for (let y = 1; y < height - 1; y += 1) {
      if (!open[y][width - 2]) {
        continue;
      }

      const d = dist[y][width - 2];
      if (d < 0) {
        continue;
      }

      const centerPenalty = Math.abs(y - height / 2) * 0.35;
      const score = d - centerPenalty;

      if (!best || score > best.score) {
        best = { x: width - 2, y, score, distance: d };
      }
    }

    return best;
  }

  function reconstructPath(prev, start, goal) {
    const path = [];
    let cursor = { x: goal.x, y: goal.y };

    while (cursor) {
      path.push(cursor);
      if (cursor.x === start.x && cursor.y === start.y) {
        break;
      }
      cursor = prev[cursor.y][cursor.x];
    }

    path.reverse();
    return path;
  }

  function analyzePath(path) {
    if (path.length < 2) {
      return { length: path.length, turns: 0, rightDownOnly: true, rightDownOneTurn: true };
    }

    const dirs = [];
    for (let i = 1; i < path.length; i += 1) {
      const dx = path[i].x - path[i - 1].x;
      const dy = path[i].y - path[i - 1].y;
      if (dx === 1) dirs.push('R');
      else if (dx === -1) dirs.push('L');
      else if (dy === 1) dirs.push('D');
      else if (dy === -1) dirs.push('U');
    }

    let turns = 0;
    for (let i = 1; i < dirs.length; i += 1) {
      if (dirs[i] !== dirs[i - 1]) {
        turns += 1;
      }
    }

    const onlyRD = dirs.every(function (dir) {
      return dir === 'R' || dir === 'D';
    });

    return {
      length: path.length,
      turns,
      rightDownOnly: onlyRD,
      rightDownOneTurn: onlyRD && turns <= 1
    };
  }

  function openExit(open, goalY) {
    const width = open[0].length;
    open[goalY][width - 1] = true;
  }

  function buildWallsFromOpen(open, cellSize) {
    const walls = [];

    for (let y = 0; y < open.length; y += 1) {
      let x = 0;
      while (x < open[0].length) {
        if (open[y][x]) {
          x += 1;
          continue;
        }

        const startX = x;
        while (x < open[0].length && !open[y][x]) {
          x += 1;
        }

        walls.push({
          x: startX * cellSize,
          y: y * cellSize,
          width: (x - startX) * cellSize,
          height: cellSize
        });
      }
    }

    return walls;
  }

  function applySingleProfile(open, rng, profileName) {
    if (profileName === 'citadel') {
      addChambers(open, rng, 3, 3, 4);
      return;
    }

    if (profileName === 'crypt') {
      addRuneCross(open, rng);
      addChambers(open, rng, 2, 2, 3);
      return;
    }

    if (profileName === 'serpent') {
      addSerpentCuts(open, rng, 3);
      return;
    }

    if (profileName === 'fortress') {
      addChambers(open, rng, 5, 3, 5);
      addRuneCross(open, rng);
      return;
    }

    if (profileName === 'rings') {
      addCircularRelics(open, rng);
      addSerpentCuts(open, rng, 2);
    }
  }

  function applyProfileFeatures(open, rng, profile) {
    const profileList = Array.isArray(profile.profile) ? profile.profile : [profile.profile];
    profileList.forEach(function (profileName) {
      applySingleProfile(open, rng, profileName);
    });
  }

  function generateQualifiedLayout(config) {
    const gridSize = Math.floor(config.size / CELL_SIZE);
    const start = { x: 1, y: 1 };

    for (let attempt = 0; attempt < 280; attempt += 1) {
      const attemptProfile = {
        biasX: config.biasX,
        biasY: config.biasY,
        straightness: config.straightness
      };

      const seed = config.seed + attempt * 97;
      const base = carvePerfectMaze(gridSize, gridSize, seed, attemptProfile);
      const open = base.open;

      addLoops(open, base.rng, config.loopCount + Math.floor(attempt / 20));
      applyProfileFeatures(open, base.rng, config);
      normalizeBorders(open);

      const firstScan = bfs(open, start);
      pruneUnreachableFromStart(open, firstScan.dist);

      const search = bfs(open, start);
      const goal = findGoalNearRight(open, search.dist);
      if (!goal) {
        continue;
      }

      const path = reconstructPath(search.prev, start, goal);
      const metrics = analyzePath(path);

      if (metrics.length < config.minPathLength) {
        continue;
      }
      if (metrics.turns < config.minTurns) {
        continue;
      }
      if (metrics.rightDownOneTurn) {
        continue;
      }

      openExit(open, goal.y);

      return {
        open,
        start,
        goal: { x: goal.x, y: goal.y }
      };
    }

    // Safe fallback (still non-trivial because thresholds are gradually reduced here).
    const base = carvePerfectMaze(gridSize, gridSize, config.seed + 991, {
      biasX: config.biasX,
      biasY: config.biasY,
      straightness: config.straightness
    });
    addLoops(base.open, base.rng, config.loopCount + 8);
    normalizeBorders(base.open);

    const initialFallbackScan = bfs(base.open, { x: 1, y: 1 });
    pruneUnreachableFromStart(base.open, initialFallbackScan.dist);

    const fallbackSearch = bfs(base.open, { x: 1, y: 1 });
    let fallbackGoal = findGoalNearRight(base.open, fallbackSearch.dist);

    if (!fallbackGoal) {
      let farthest = { x: 1, y: 1, distance: 0 };
      for (let y = 1; y < gridSize - 1; y += 1) {
        for (let x = 1; x < gridSize - 1; x += 1) {
          const d = fallbackSearch.dist[y][x];
          if (d > farthest.distance) {
            farthest = { x, y, distance: d };
          }
        }
      }

      for (let x = farthest.x; x <= gridSize - 2; x += 1) {
        base.open[farthest.y][x] = true;
      }

      fallbackGoal = { x: gridSize - 2, y: farthest.y };
    }

    openExit(base.open, fallbackGoal.y);

    return {
      open: base.open,
      start: { x: 1, y: 1 },
      goal: { x: fallbackGoal.x, y: fallbackGoal.y }
    };
  }

  function buildLevel(config) {
    const generated = generateQualifiedLayout(config);

    return {
      id: config.id,
      name: config.name,
      difficulty: config.difficulty,
      size: config.size,
      cellSize: CELL_SIZE,
      walls: buildWallsFromOpen(generated.open, CELL_SIZE),
      start: {
        x: generated.start.x * CELL_SIZE + CELL_SIZE / 2,
        y: generated.start.y * CELL_SIZE + CELL_SIZE / 2,
        radius: 8
      },
      goal: {
        x: generated.goal.x * CELL_SIZE,
        y: generated.goal.y * CELL_SIZE,
        width: CELL_SIZE,
        height: CELL_SIZE
      }
    };
  }

  const BASE_LEVEL_DEFS = [
    {
      id: 1,
      name: 'Easy I - Ember Keep',
      difficulty: 'Easy',
      size: 400,
      seed: 1401,
      loopCount: 22,
      minPathLength: 62,
      minTurns: 9,
      biasX: 1.2,
      biasY: 1.08,
      straightness: 1.1,
      profile: 'citadel'
    },
    {
      id: 2,
      name: 'Easy II - Frost Gallery',
      difficulty: 'Easy',
      size: 400,
      seed: 1429,
      loopCount: 24,
      minPathLength: 66,
      minTurns: 10,
      biasX: 1.0,
      biasY: 1.3,
      straightness: 1.08,
      profile: 'crypt'
    },
    {
      id: 3,
      name: 'Easy III - Ashen Bastion',
      difficulty: 'Easy',
      size: 400,
      seed: 1457,
      loopCount: 26,
      minPathLength: 70,
      minTurns: 11,
      biasX: 1.28,
      biasY: 1.02,
      straightness: 1.2,
      profile: 'serpent'
    },
    {
      id: 4,
      name: 'Medium I - Iron Cathedral',
      difficulty: 'Medium',
      size: 600,
      seed: 3103,
      loopCount: 56,
      minPathLength: 116,
      minTurns: 18,
      biasX: 1.18,
      biasY: 1.2,
      straightness: 1.12,
      profile: 'crypt'
    },
    {
      id: 5,
      name: 'Medium II - Twin Crypts',
      difficulty: 'Medium',
      size: 600,
      seed: 3137,
      loopCount: 60,
      minPathLength: 122,
      minTurns: 19,
      biasX: 1.36,
      biasY: 1.0,
      straightness: 1.15,
      profile: 'citadel'
    },
    {
      id: 6,
      name: 'Medium III - Serpent Depths',
      difficulty: 'Medium',
      size: 600,
      seed: 3181,
      loopCount: 64,
      minPathLength: 130,
      minTurns: 21,
      biasX: 1.0,
      biasY: 1.36,
      straightness: 1.1,
      profile: 'serpent'
    },
    {
      id: 7,
      name: 'Hard I - Dragon Necropolis',
      difficulty: 'Hard',
      size: 900,
      seed: 7109,
      loopCount: 132,
      minPathLength: 190,
      minTurns: 33,
      biasX: 1.23,
      biasY: 1.22,
      straightness: 1.12,
      profile: 'fortress'
    },
    {
      id: 8,
      name: 'Hard II - Dread Fortress',
      difficulty: 'Hard',
      size: 900,
      seed: 7151,
      loopCount: 138,
      minPathLength: 200,
      minTurns: 35,
      biasX: 1.38,
      biasY: 1.03,
      straightness: 1.2,
      profile: 'fortress'
    },
    {
      id: 9,
      name: 'Hard III - Crown of Relics',
      difficulty: 'Hard',
      size: 900,
      seed: 7207,
      loopCount: 144,
      minPathLength: 210,
      minTurns: 37,
      biasX: 1.1,
      biasY: 1.18,
      straightness: 1.15,
      profile: 'rings'
    }
  ];

  const EXTRA_LEVEL_TEMPLATES = [
    { name: 'Easy IV - Azure Atrium', difficulty: 'Easy', size: 400, seed: 9101, loopCount: 30, minPathLength: 76, minTurns: 13, biasX: 1.08, biasY: 1.16, straightness: 1.11, profile: ['citadel'] },
    { name: 'Easy V - Rune Library', difficulty: 'Easy', size: 400, seed: 9177, loopCount: 32, minPathLength: 82, minTurns: 14, biasX: 1.02, biasY: 1.22, straightness: 1.16, profile: ['crypt'] },
    { name: 'Easy VI - Moonwell Crossing', difficulty: 'Easy', size: 400, seed: 9253, loopCount: 34, minPathLength: 86, minTurns: 15, biasX: 1.24, biasY: 1.02, straightness: 1.2, profile: ['serpent'] },
    { name: 'Easy VII - Gilded Watch', difficulty: 'Easy', size: 400, seed: 9329, loopCount: 36, minPathLength: 90, minTurns: 16, biasX: 1.18, biasY: 1.12, straightness: 1.18, profile: ['citadel', 'crypt'] },
    { name: 'Easy VIII - Harbor Annex', difficulty: 'Easy', size: 400, seed: 9405, loopCount: 37, minPathLength: 92, minTurns: 16, biasX: 1.12, biasY: 1.2, straightness: 1.15, profile: ['crypt', 'serpent'] },
    { name: 'Easy IX - Sunken Lantern Hall', difficulty: 'Easy', size: 400, seed: 9481, loopCount: 38, minPathLength: 95, minTurns: 17, biasX: 1.28, biasY: 1.0, straightness: 1.21, profile: ['serpent', 'citadel'] },
    { name: 'Easy X - Ivy Rampart', difficulty: 'Easy', size: 400, seed: 9557, loopCount: 40, minPathLength: 98, minTurns: 18, biasX: 1.14, biasY: 1.18, straightness: 1.18, profile: ['rings'] },
    { name: 'Medium IV - Obsidian Archives', difficulty: 'Medium', size: 600, seed: 9633, loopCount: 78, minPathLength: 144, minTurns: 25, biasX: 1.08, biasY: 1.28, straightness: 1.14, profile: ['crypt', 'fortress'] },
    { name: 'Medium V - Tidal Monastery', difficulty: 'Medium', size: 600, seed: 9709, loopCount: 82, minPathLength: 152, minTurns: 26, biasX: 1.22, biasY: 1.1, straightness: 1.19, profile: ['citadel', 'serpent'] },
    { name: 'Medium VI - Vault of Feathers', difficulty: 'Medium', size: 600, seed: 9785, loopCount: 86, minPathLength: 160, minTurns: 27, biasX: 1.18, biasY: 1.16, straightness: 1.16, profile: ['rings', 'crypt'] },
    { name: 'Medium VII - Cathedral Annex', difficulty: 'Medium', size: 600, seed: 9861, loopCount: 90, minPathLength: 168, minTurns: 28, biasX: 1.32, biasY: 1.04, straightness: 1.21, profile: ['fortress'] },
    { name: 'Medium VIII - Lab of Mirrors', difficulty: 'Medium', size: 600, seed: 9937, loopCount: 94, minPathLength: 174, minTurns: 30, biasX: 1.0, biasY: 1.34, straightness: 1.1, profile: ['serpent', 'rings'] },
    { name: 'Medium IX - Storm Relay', difficulty: 'Medium', size: 600, seed: 10013, loopCount: 97, minPathLength: 182, minTurns: 31, biasX: 1.26, biasY: 1.08, straightness: 1.18, profile: ['citadel', 'fortress'] },
    { name: 'Medium X - Celestial Trench', difficulty: 'Medium', size: 600, seed: 10089, loopCount: 102, minPathLength: 188, minTurns: 32, biasX: 1.12, biasY: 1.26, straightness: 1.17, profile: ['rings', 'serpent', 'crypt'] },
    { name: 'Hard IV - Warden Causeway', difficulty: 'Hard', size: 900, seed: 10165, loopCount: 166, minPathLength: 232, minTurns: 42, biasX: 1.2, biasY: 1.2, straightness: 1.16, profile: ['fortress', 'crypt'] },
    { name: 'Hard V - Astral Engine', difficulty: 'Hard', size: 900, seed: 10241, loopCount: 172, minPathLength: 244, minTurns: 44, biasX: 1.34, biasY: 1.06, straightness: 1.21, profile: ['rings', 'fortress'] },
    { name: 'Hard VI - Citadel Core', difficulty: 'Hard', size: 900, seed: 10317, loopCount: 178, minPathLength: 256, minTurns: 46, biasX: 1.06, biasY: 1.34, straightness: 1.12, profile: ['serpent', 'crypt', 'citadel'] },
    { name: 'Hard VII - Dragon Relay Nexus', difficulty: 'Hard', size: 900, seed: 10393, loopCount: 184, minPathLength: 268, minTurns: 48, biasX: 1.24, biasY: 1.24, straightness: 1.18, profile: ['fortress', 'serpent'] },
    { name: 'Hard VIII - Imperial Spiral', difficulty: 'Hard', size: 900, seed: 10469, loopCount: 191, minPathLength: 278, minTurns: 50, biasX: 1.3, biasY: 1.14, straightness: 1.2, profile: ['rings', 'citadel', 'crypt'] },
    { name: 'Hard IX - Final Rune Circuit', difficulty: 'Hard', size: 900, seed: 10545, loopCount: 198, minPathLength: 290, minTurns: 53, biasX: 1.16, biasY: 1.3, straightness: 1.22, profile: ['fortress', 'rings', 'serpent'] }
  ];

  const EXTRA_LEVEL_DEFS = EXTRA_LEVEL_TEMPLATES.map(function (template, idx) {
    return Object.assign({ id: BASE_LEVEL_DEFS.length + idx + 1 }, template);
  });

  const LEVEL_DEFS = BASE_LEVEL_DEFS.concat(EXTRA_LEVEL_DEFS);

  window.LEVELS = LEVEL_DEFS.map(buildLevel);
})();
