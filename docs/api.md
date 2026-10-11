# TypeOS JavaScript API

TypeOS can run real JavaScript. A file is run as JS if it ends in `.js` or starts with a `#!js` line. Everything below is available as a global inside the script, and the script runs inside an `async` function, so top-level `await` works.

```js
#!js
print("hello " + whoami())
```

Run it with `./hello.js`, or by name if it's in a folder on `$PATH`. Files that don't end in `.js` need `chmod +x` first.

## Output

| Function | Description |
| --- | --- |
| `print(s)` | Prints a line to the terminal. |
| `printf(s, color?)` | Prints a line in a CSS color, e.g. `printf("oops", "red")`. |

## Input

| Function | Description |
| --- | --- |
| `await input(prompt?, mask?)` | Asks the user for a line of text. Pass `mask = true` to show `*` instead of what they type (for passwords). This doesn't work while a `screen()` is open; use `readKey()` there. |
| `args` | Array of the arguments the script was run with. |

## Files

Paths can be absolute or relative to the current directory.

| Function | Description |
| --- | --- |
| `readFile(path)` | Returns the file's contents, or `null` if it doesn't exist. |
| `writeFile(path, data)` | Creates or overwrites a file. |
| `deleteFile(path)` | Deletes a file. |
| `listFiles(dir)` | Returns the names in a directory. Subdirectories end with `/`. |
| `cwd()` | Current directory. |
| `resolvePath(path)` | Turns a relative path into an absolute one. |

### Permissions

`writeFile` and `deleteFile` follow the same rules as the shell. A normal user can only write inside their own `/home/<user>`, and anything else throws `permission denied`. Run the script with `sudo` to write anywhere.

These checks only cover the API. They aren't a security sandbox.

## System

| Function | Description |
| --- | --- |
| `whoami()` | Current user. |
| `env(name)` | Value of an environment variable, or `null`. |
| `await run(line)` | Runs a shell command, e.g. `await run("ls /")`. It goes through the normal shell, so the normal permissions apply. |
| `exit(code?)` | Stops the script right away. |
| `restart()` | Reboots TypeOS. Root only. |

## Timing and randomness

| Function | Description |
| --- | --- |
| `await sleep(ms)` | Waits `ms` milliseconds. |
| `now()` | High-precision time in ms. Use it to measure how long something took. |
| `random(min = 0, max = 1)` | Random float in `[min, max)`. |
| `randInt(min, max)` | Random integer in `[min, max]`, both ends included. |

## Sound

| Function | Description |
| --- | --- |
| `beep(freq = 440, ms = 100)` | Plays a short square-wave beep. Browsers only allow sound after the user has pressed a key or clicked, which is always true when a command was typed. |

## Storage

`storage` saves values per app, so you don't need to manage files yourself. Values are stored as JSON in `~/.local/share/<app>/<key>`, where `<app>` is the script's filename without `.js`.

```js
const best = storage.get("highscore") ?? 0
if (score > best) storage.set("highscore", score)
```

| Function | Description |
| --- | --- |
| `storage.get(key)` | Saved value, or `null`. |
| `storage.set(key, value)` | Saves any value that can be turned into JSON. |
| `storage.remove(key)` | Deletes a saved value. |

## Screen

`screen()` opens a fullscreen view that takes over the terminal. Use it for anything interactive: editors, menus, games. Always call `close()` when you're done, or the user is stuck in it.

```js
const s = screen()
```

### Bars

| Method | Description |
| --- | --- |
| `s.setHeader(text)` | Shows a bar at the top. An empty string hides it. |
| `s.setFooter(text)` | Shows a bar at the bottom. An empty string hides it. |

### Size

| Method | Description |
| --- | --- |
| `s.size()` | Returns `{ cols, rows }`: how many characters fit across and down. |
| `s.onResize((cols, rows) => {})` | Called when the window is resized. |

### Keyboard

Keys use the browser's [`KeyboardEvent.key`](https://developer.mozilla.org/en-US/docs/Web/API/UI_Events/Keyboard_event_key_values) names: `"a"`, `"Enter"`, `"Escape"`, `"ArrowUp"`, `" "` (space), and so on.

| Method | Description |
| --- | --- |
| `s.onKey((key, ctrl) => {})` | Called on every key press. Holding a key repeats it. |
| `s.onKeyUp(key => {})` | Called when a key is released. |
| `await s.readKey()` | Waits for the next key press and returns `{ key, ctrl }`. Good for turn-based apps. |
| `s.isDown(key)` | `true` while the key is held. Letters ignore case, so `isDown("a")` still works while Shift is held. Use this for movement in games. |

### Drawing text

| Method | Description |
| --- | --- |
| `s.render(text)` | Replaces the whole screen with a plain string. This is the simplest option. |

### Drawing cells

For games and layouts, treat the screen as a grid of characters. `(0, 0)` is the top-left corner. Positions are rounded down, and anything off-screen is ignored, so you don't have to clip by hand.

`style` is optional: `{ fg: "lime", bg: "#222" }`. Any CSS color works.

| Method | Description |
| --- | --- |
| `s.put(x, y, ch, style?)` | Draws one character. |
| `s.text(x, y, str, style?)` | Draws a string starting at `(x, y)`. |
| `s.fill(x, y, w, h, ch = " ", style?)` | Fills a rectangle. |
| `s.clear()` | Blanks the whole grid. |
| `s.flush()` | Shows what you've drawn. Inside `loop()` this happens automatically after every frame. Call it yourself only when you draw outside a loop. |

`render()` and cell drawing both write to the same screen. Whichever runs last wins.

### Game loop

| Method | Description |
| --- | --- |
| `await s.loop(dt => {})` | Calls the function once per frame (usually 60 times a second). `dt` is the milliseconds since the last frame. Multiply speeds by it so the game runs at the same speed on any monitor. |
| `s.stopLoop()` | Stops the loop. `close()` also stops it. |

Always `await` the loop. The promise finishes when the loop stops. If your frame code throws, the loop stops and the error is printed. Without `await`, the error is lost.

### Closing

| Method | Description |
| --- | --- |
| `s.close()` | Stops the loop, removes all handlers and returns to the terminal. |

## Example: moving a dot

```js
#!js
const s = screen()
let x = 5, y = 5
const speed = 0.02 // cells per ms

s.setFooter("arrows to move, q to quit")
s.onKey(k => { if (k == "q") s.close() })

await s.loop(dt => {
    const { cols, rows } = s.size()
    if (s.isDown("ArrowLeft"))  x -= speed * dt
    if (s.isDown("ArrowRight")) x += speed * dt
    if (s.isDown("ArrowUp"))    y -= speed * dt
    if (s.isDown("ArrowDown"))  y += speed * dt
    x = Math.max(0, Math.min(cols - 1, x))
    y = Math.max(0, Math.min(rows - 1, y))

    s.clear()
    s.text(0, 0, "x: " + Math.floor(x) + " y: " + Math.floor(y), { fg: "gray" })
    s.put(x, y, "@", { fg: "lime" })
})
```

## Example: turn-based menu

```js
#!js
const s = screen()
const items = ["Play", "Settings", "Quit"]
let sel = 0

while (true) {
    s.clear()
    items.forEach((item, i) => {
        s.text(2, i + 1, (i == sel ? "> " : "  ") + item, i == sel ? { fg: "black", bg: "white" } : {})
    })
    s.flush()

    const { key } = await s.readKey()
    if (key == "ArrowUp")   sel = (sel + items.length - 1) % items.length
    if (key == "ArrowDown") sel = (sel + 1) % items.length
    if (key == "Enter") break
}

s.close()
print("you picked " + items[sel])
```
