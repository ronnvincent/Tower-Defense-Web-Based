# Algorithm Pseudocode Specifications

This document outlines the high-level pseudocode for the primary data structures and custom algorithms implemented in *Tower Defense: DSALGO Bastion Edition*.

---

## 1. Breadth-First Search (BFS) Shortest Path

```text
ALGORITHM BFS_ShortestPath(graph, startNode, goalNode, blockedSet)
  INPUT:
    graph       : Adjacency list representation of road cells
    startNode   : Spawn cell identifier (e.g., "5,1")
    goalNode    : Base cell identifier (e.g., "5,18")
    blockedSet  : Optional set of nodes temporarily treated as impassable

  OUTPUT:
    result      : { found: Boolean, path: List of nodes, stats: Telemetry }

  IF startNode not in graph OR goalNode not in graph THEN
    RETURN { found: false, path: [], reason: "endpoint-missing" }
  END IF

  IF blockedSet contains startNode OR blockedSet contains goalNode THEN
    RETURN { found: false, path: [], reason: "endpoint-blocked" }
  END IF

  frontier <- Instantiate CircularBufferQueue()
  visited  <- Instantiate Set()
  parent   <- Instantiate Map()

  visited.add(startNode)
  parent.set(startNode, NULL)
  frontier.enqueue(startNode)

  WHILE frontier.isEmpty() IS FALSE DO
    currentNode <- frontier.dequeue()

    IF currentNode == goalNode THEN
      path <- ReconstructPath(parent, goalNode)
      RETURN { found: true, path: path, stats: CollectTelemetry() }
    END IF

    FOR EACH neighbor IN graph.getNeighbors(currentNode) DO
      IF neighbor NOT IN visited AND (blockedSet IS NULL OR neighbor NOT IN blockedSet) THEN
        visited.add(neighbor)
        parent.set(neighbor, currentNode)
        frontier.enqueue(neighbor)
      END IF
    END FOR
  END WHILE

  RETURN { found: false, path: [], reason: "unreachable" }
END ALGORITHM


ALGORITHM ReconstructPath(parentMap, goalNode)
  path <- Empty List
  curr <- goalNode
  WHILE curr IS NOT NULL DO
    path.append(curr)
    curr <- parentMap.get(curr)
  END WHILE
  REVERSE(path)
  RETURN path
END ALGORITHM
```

---

## 2. Student Merge Sort (Top-Down Recursive)

```text
ALGORITHM MergeSort(itemsArray, compareFunction)
  INPUT:
    itemsArray      : Array of elements to sort
    compareFunction : Function returning negative if first item precedes second

  OUTPUT:
    sortedArray     : New sorted array in non-decreasing order

  FUNCTION SortSubarray(arr)
    n <- arr.length
    IF n <= 1 THEN
      RETURN arr  // Base case: arrays of 0 or 1 item are already sorted
    END IF

    mid <- floor(n / 2)
    leftSubarray  <- Copy of arr[0 ... mid - 1]
    rightSubarray <- Copy of arr[mid ... n - 1]

    sortedLeft  <- SortSubarray(leftSubarray)
    sortedRight <- SortSubarray(rightSubarray)

    RETURN Merge(sortedLeft, sortedRight, compareFunction)
  END FUNCTION

  RETURN SortSubarray(CopyOf(itemsArray))
END ALGORITHM


ALGORITHM Merge(leftArr, rightArr, compareFunction)
  result <- Array of size (leftArr.length + rightArr.length)
  i <- 0, j <- 0, k <- 0

  WHILE i < leftArr.length AND j < rightArr.length DO
    IF compareFunction(leftArr[i], rightArr[j]) <= 0 THEN
      result[k] <- leftArr[i]
      i <- i + 1
    ELSE
      result[k] <- rightArr[j]
      j <- j + 1
    END IF
    k <- k + 1
  END WHILE

  // Copy remaining items
  WHILE i < leftArr.length DO
    result[k] <- leftArr[i]
    i <- i + 1; k <- k + 1
  END WHILE

  WHILE j < rightArr.length DO
    result[k] <- rightArr[j]
    j <- j + 1; k <- k + 1
  END WHILE

  RETURN result
END ALGORITHM
```

---

## 3. Circular Buffer Queue (FIFO)

```text
CLASS CircularBufferQueue:
  PROPERTIES:
    buffer   : Fixed-size Array
    capacity : Integer (initial capacity, e.g., 16)
    head     : Integer (index of front element)
    count    : Integer (number of stored items)

  CONSTRUCTOR(initialCapacity):
    capacity <- initialCapacity
    buffer   <- New Array of size capacity
    head     <- 0
    count    <- 0
  END CONSTRUCTOR

  METHOD enqueue(item):
    IF count == capacity THEN
      GrowBuffer()  // Double capacity and unroll
    END IF
    tailIndex <- (head + count) MOD capacity
    buffer[tailIndex] <- item
    count <- count + 1
  END METHOD

  METHOD dequeue():
    IF count == 0 THEN
      RETURN UNDEFINED
    END IF
    item <- buffer[head]
    buffer[head] <- UNDEFINED  // Prevent stale memory references
    head <- (head + 1) MOD capacity
    count <- count - 1
    RETURN item
  END METHOD

  METHOD peek():
    IF count == 0 THEN RETURN UNDEFINED END IF
    RETURN buffer[head]
  END METHOD

  METHOD GrowBuffer():
    newCapacity <- capacity * 2
    newBuffer   <- New Array of size newCapacity
    FOR i FROM 0 TO count - 1 DO
      newBuffer[i] <- buffer[(head + i) MOD capacity]
    END FOR
    buffer   <- newBuffer
    capacity <- newCapacity
    head     <- 0
  END METHOD
END CLASS
```

---

## 4. Palisade Siege Resolution

```text
ALGORITHM UpdateSiege(enemy, graphRoute, barricadeIndex)
  INPUT:
    enemy          : Living enemy entity with a position and a route
    barricadeIndex : Map<"row,col", Palisade> built by PlacementSystem

  OUTPUT:
    true when the enemy spent this frame attacking a wall

  nextCell <- enemy.route[enemy.pathIndex]
  wall     <- barricadeIndex.get(nextCell)
  IF wall is null OR wall.health <= 0 THEN
    RETURN false                       // normal waypoint movement continues
  END IF

  // 1. Stand one stop-distance OUTSIDE the wall tile (never inside it)
  target <- ApproachPoint(enemy.position, wall.position, STOP_DISTANCE)

  // 2. Spread the pack sideways so attackers do not stack on one pixel
  target <- target + perpendicularOffset(enemy.id)

  IF distance(enemy.position, target) > step THEN
    enemy.position <- moveTowards(enemy.position, target, step)
    RETURN true
  END IF

  // 3. In contact: swing on the archetype's cadence
  enemy.siegeTimer <- enemy.siegeTimer + delta
  IF enemy.siegeTimer >= enemy.def.siegeInterval THEN
    enemy.siegeTimer <- enemy.siegeTimer - enemy.def.siegeInterval
    swing <- ResolveSiegeSwing(wall, enemy.def.siege)
    wall.takeDamage(swing.dealt)
    IF swing.destroyed THEN
      activeTowers.remove(wall)
      placement.release(wall.cell)     // the road is open again
    END IF
  END IF
  RETURN true
END ALGORITHM
```

```text
ALGORITHM ValidateBuild(typeKey, row, col)
  definition <- getBuildDefinition(typeKey)
  basic      <- PlacementSystem.validate(definition, row, col, coins)

  IF basic.ok IS FALSE THEN RETURN basic END IF

  // A wall only pays off on the lanes the horde actually marches. Every route
  // the map offers is legal ground now (one wave per lane), so the set is the
  // union of all lanes — a decoy road would otherwise swallow the 30 gold and
  // read as a dodge.
  routeCells <- PathfindingSystem.laneCells          // union of every lane, once on load
  IF typeKey == "barricade" AND NOT routeCells.has(cellKey(row, col)) THEN
    RETURN { ok: false, reason: "off-route" }
  END IF

  // A wall may not be dropped on top of a living enemy.
  IF typeKey == "barricade" AND anyLivingEnemyOccupies(row, col) THEN
    RETURN { ok: false, reason: "enemy-on-tile" }
  END IF

  RETURN { ok: true, reason: null }
END ALGORITHM
```

> **Why the old `TryBlockCell` algorithm is gone.** It removed the road node from
> the graph and pushed BFS onto a 26-cell detour whenever a 22-cell lane was
> walled off — i.e. the horde *dodged* the palisade. Players read that as the
> wall doing nothing. The graph now describes the road network only; walls are
> physical hit-point objects resolved by `UpdateSiege` above.

---

## 5. Gate Coverage: who may answer an assault

```text
ALGORITHM AcquireTarget(tower)
  range      <- tower.attackRange                     // the only distance gate
  bastion    <- tower.context.getBasePoint()          // GameScene.bastionPoint(), one definition
  coversGate <- bastion != null
                AND distance(tower, bastion) <= range
  candidates <- []

  FOR each enemy IN tower.context.activeEnemies DO
    IF NOT CanEngage(tower, enemy) THEN CONTINUE        // categories, live filter, supportOnly
    d <- distance(tower, enemy)

    // The gate rule: a defence that covers the bastion answers the creeps
    // hitting the bastion, even from the far side of the assault ring
    // (radius 72 px, inside the no-build moat, out of range for most of the line).
    hitsTheGate <- coversGate AND enemy.assaulting == true

    IF d > range AND NOT hitsTheGate THEN CONTINUE
    // No minimum range: a creep inside the ring is shootable at any distance.
    // A floor of 90–140 px was wider than the 64 px gap between a tower's tile
    // and the road beside it, so siege pieces went silent on any walk-by.
    candidates.push({ enemy, d })
  END FOR

  IF candidates is empty THEN
    tower.currentTarget <- null
    RETURN
  END IF

  IF focusTarget is marked AND legal AND inside candidates THEN
    tower.currentTarget <- focusTarget
    RETURN
  END IF

  SortTargets(candidates, tower.targetingMode)          // FIRST / LAST / STRONG / NEAR / ...
  tower.currentTarget <- candidates[0].enemy
END ALGORITHM

ALGORITHM UpdateCooldown(tower, deltaMs)
  // A frame longer than the time left used to park the timer at a permanent
  // negative (-30 was visible on every idle tower); it is floored at zero.
  IF tower.cooldownTimer > 0 THEN
    tower.cooldownTimer <- max(0, tower.cooldownTimer - deltaMs)
  END IF
END ALGORITHM
```
---

## 6. Defence Hunting: what a creep attacks, and in what order

```text
ALGORITHM HuntRadiusFor(attacker, bastion)
  IF bastion is null THEN RETURN DEFENCE_HUNT_RADIUS END IF
  toBase <- distance(attacker, bastion)
  IF toBase <= GATE_GUARD_RADIUS THEN RETURN GATE_GUARD_RADIUS END IF
  RETURN DEFENCE_HUNT_RADIUS                 // tight radius out on the road
END ALGORITHM

ALGORITHM PickDefenceInReach(attacker, structures, radius)
  best <- null ; bestScore <- INFINITY
  FOR each structure IN structures DO
    IF structure.isDestroyed OR structure.health <= 0 THEN CONTINUE
    d <- distance(attacker, structure)
    IF d > radius THEN CONTINUE
    // A palisade is literally in the road, so it wins a near-tie.
    score <- d - (structure.isBarricade ? 8 : 0)
    IF score < bestScore THEN best <- structure ; bestScore <- score
  END FOR
  RETURN best
END ALGORITHM

ALGORITHM EnemyUpdate(deltaMs)          // the relevant slice
  IF flying THEN skip hunting END IF
  guard <- GetStructureAhead()          // a wall on the next waypoint
           OR GetDefenceInReach()       // or any standing defence in reach
  IF guard is not null AND UpdateSiege(deltaMs, guard) THEN
    RETURN                              // defences come first
  END IF
  IF UpdateBaseAssault(deltaMs) THEN
    RETURN                              // the gate is the last thing touched
  END IF
  MoveAlongWaypoints(deltaMs)
END ALGORITHM
```
