# World-map source sheets

These are the **painted source sheets** the world map is cut from. They are not
served: Vite copies `public/` verbatim, and three magenta-backed 1536×1024 PNGs
are ~7 MB of dead weight for a player.

```
python3 scripts/build_world_map.py     # art-source/worldmap -> public/assets/worldmap
```

- `sheet-a.png` — castle, forge, royal library, mirror arena (2×2)
- `sheet-b.png` — war room, champions' hall, heroes' monument, shrine (2×2)
- `sheet-c.png` — the five stage banners, left to right, top row then bottom:
  verdant (leaf), sunscorch (sun), frostbite (snowflake), prism (crystal),
  endless (skull)

The cutter keys out the magenta, despills the soft edge, finds the islands and
writes them in **row-major** order, which is the order the tables above use.
Change a sheet and the six names per row must stay in that order, or a stage
will end up flying another region's banner (that is exactly the bug the row
clustering in `order_grid()` fixed).
