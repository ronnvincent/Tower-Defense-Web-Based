# Algorithm Pseudocode Specifications

This document outlines the high-level pseudocode for the primary data structures and custom algorithms implemented in *Tower Defense: DSALGO Bastion Edition*.

---

## 1. Breadth-First Search (BFS) Shortest Path

```text
ALGORITHM BFS_ShortestPath(graph, startNode, goalNode, blockedSet)
  INPUT:
    graph       : Adjacency list representation of road cells
    startNode   : Spawn cell identifier (e.g., "5,0")
    goalNode    : Base cell identifier (e.g., "5,19")
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

## 4. Barricade Feasibility Validation

```text
ALGORITHM TryBlockCell(graph, candidateCell, livingEnemiesList, spawnCell, baseCell)
  INPUT:
    candidateCell    : Road cell the player clicked to place barricade
    livingEnemiesList: Array of living enemy entities with their next target cell
    spawnCell        : Spawn coordinate "5,0"
    baseCell         : Base coordinate "5,19"

  OUTPUT:
    result           : { ok: Boolean, reason: String, enemyPaths: Map }

  IF candidateCell == spawnCell OR candidateCell == baseCell THEN
    RETURN { ok: false, reason: "endpoint" }
  END IF

  // 1. Verify Spawn still reaches Base
  blockedSet <- Set containing candidateCell
  spawnTest <- BFS_ShortestPath(graph, spawnCell, baseCell, blockedSet)
  IF spawnTest.found IS FALSE THEN
    RETURN { ok: false, reason: "blocks-path" }
  END IF

  // 2. Verify all living enemies still reach Base
  enemyPathMap <- Instantiate Map()
  FOR EACH enemy IN livingEnemiesList DO
    enemyStart <- enemy.nextTargetCell
    IF enemyStart == candidateCell THEN
      RETURN { ok: false, reason: "enemy-on-tile" }
    END IF

    // Use cached path if another enemy is heading to the same cell
    IF enemyPathMap DOES NOT CONTAIN enemyStart THEN
      enemyTest <- BFS_ShortestPath(graph, enemyStart, baseCell, blockedSet)
      IF enemyTest.found IS FALSE THEN
        RETURN { ok: false, reason: "traps-enemy" }
      END IF
      enemyPathMap.set(enemyStart, enemyTest.path)
    END IF
  END FOR

  // 3. Commit graph edge cut
  graph.removeNode(candidateCell)
  RETURN { ok: true, enemyPaths: enemyPathMap }
END ALGORITHM
```
