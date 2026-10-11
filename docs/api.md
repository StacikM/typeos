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
| `exists(path)` | `true` if a file or directory is there. |
| `isDir(path)` | `true` if the path is a directory. |
| `stat(path)` | Returns `{ type: "file" \| "dir", size, executable }`, or `null` if nothing is there. `size` is in characters. |
| `mkdir(path)` | Creates a directory. |
| `rmdir(path)` | Deletes a directory and everything in it. Refuses to delete `/`. |
| `copy(from, to)` | Copies a file. The copy keeps the executable flag. |
| `move(from, to)` | Moves or renames a file. |
| `chmod(path, exec)` | Marks a file executable (`true`) or not (`false`). |
| `cwd()` | Current directory. |
| `resolvePath(path)` | Turns a relative path into an absolute one. |

Functions that need a file, like `copy`, `move` and `chmod`, throw `no such file` if it isn't there.

### Watching files

`watch(path, cb)` calls `cb(path, data)` whenever the file changes, or anything inside it if `path` is a directory. `data` is the new contents, or `null` if the file was deleted. It returns a function that stops watching. Watchers keep running after your script ends, so call it when you're done.

```js
const stop = watch("/home/root/notes.txt", (path, data) => {
    s.render(data ?? "(deleted)")
})
// later
stop()
```

### Permissions

`writeFile`, `deleteFile`, `mkdir`, `rmdir`, `copy` (the destination), `move` (both paths) and `chmod` follow the same rules as the shell. A normal user can only write inside their own `/home/<user>`, and anything else throws `permission denied`. Run the script with `sudo` to write anywhere.

These checks only cover the API. They aren't a security sandbox.

## System

| Function | Description |
| --- | --- |
| `whoami()` | Current user. |
| `env(name)` | Value of an environment variable, or `null`. |
| `setEnv(name, value)` | Sets an environment variable. It's shared with the shell, like `export`. |
| `unsetEnv(name)` | Removes an environment variable. |
| `listEnv()` | Every variable, as an array of `"NAME=value"` strings. |
| `hostname()` | The machine's hostname. |
| `users()` | Array of all user names. |
| `uptime()` | Seconds since TypeOS booted. |
| `disk()` | Returns `{ used, total, files }`. `used` and `total` are in bytes. `total` is the usual 5 MB browser storage limit. |
| `isMobile()` | `true` on phones and tablets. |
| `await run(line)` | Runs a shell command, e.g. `await run("ls /")`. It goes through the normal shell, so the normal permissions apply. |
| `exit(code?)` | Stops the script right away. |
| `restart()` | Reboots TypeOS. Root only. |

## Launching apps

`launch(name, window?, args?)` runs another JS app. When that app calls `screen()`, it opens as a window instead of fullscreen. This is how a desktop script hosts apps.

```js
launch("snake.js", { x: 10, y: 4, w: 50, h: 20 })      // don't await, so it runs alongside you
const code = await launch("/home/root/editor.js", {}, ["notes.txt"])   // wait for it to exit
```

- `name` is found the same way the shell finds commands: a path if it contains `/`, otherwise it's looked up on `$PATH`.
- `window` takes the same options as `screen()`. The defaults are `{ x: 2, y: 1, w: 60, h: 20, title: <file name> }`. Options the app passes to `screen()` itself override these.
- `launch` returns a promise with the app's exit code. Errors inside the app are printed as usual and give code `1`.
- `launch` throws if the app doesn't exist, isn't executable or isn't a JS app.

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

`screen()` opens a view that takes over the terminal: fullscreen by default, or a window (see [Windows](#windows)). Use it for anything interactive: editors, menus, games. Keyboard input goes to the screens until the last one is closed, so always call `close()` when you're done, or the user is stuck.

```js
const s = screen()
```

### Windows

You can have several screens open at once. `screen()` with no options covers the whole page. Pass a size to get a floating window instead. All positions and sizes are in character cells of the page font.

```js
const desk = screen({ bottom: true })                         // fullscreen, always underneath
const win  = screen({ x: 4, y: 2, w: 40, h: 12, title: "Notes" })
```

| Option | Description |
| --- | --- |
| `x`, `y` | Top-left corner of the window, in cells. |
| `w`, `h` | Outer size of the window in cells, including the title bar. You need both for a window; otherwise the screen is fullscreen. |
| `title` | Title bar text. Same as calling `setHeader(title)`. |
| `draggable` | Windows can be dragged by their title bar unless this is `false`. |
| `bottom` | Keeps the screen under all other screens, even when it's focused. Use it for desktops and wallpapers. |

Only the focused screen gets keyboard input (`onKey`, `readKey`, `isDown`). Clicking a screen focuses it and raises it to the top. A new screen gets focus when it opens. When the focused screen closes, the topmost remaining one gets focus.

| Method | Description |
| --- | --- |
| `s.move(x, y)` | Moves the window. |
| `s.resize(w, h)` | Resizes the window. Triggers `onResize`. Does nothing for fullscreen screens. |
| `s.rect()` | Returns `{ x, y, w, h }`. |
| `s.focus()` | Focuses the screen and raises it. |
| `s.isFocused()` | `true` if this screen gets keyboard input. |
| `s.onFocus(focused => {})` | Called when the screen gains or loses focus. |
| `s.isOpen()` | `false` once `close()` has been called. |

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

### Mouse

Mouse positions are given in cells, the same grid as `put()` and `text()`. Clicks on the header, footer or padding are ignored.

| Method | Description |
| --- | --- |
| `s.onMouse(e => {})` | Called with `{ type, x, y, button, delta }`. `type` is `"down"`, `"up"`, `"move"` or `"wheel"`. `button` is `0` for left, `1` for middle and `2` for right. `delta` is `-1` (scroll up) or `1` (scroll down), and only set for `"wheel"`. `"move"` fires only when the mouse enters a new cell. Setting a handler turns off text selection, the right-click menu and wheel scrolling on the screen. |
| `s.mouse()` | Returns `{ x, y, down }`: the last cell the mouse was over and whether the left button is held. `x` and `y` are `-1` before the mouse has moved over the screen. |
| `s.isMouseDown(button = 0)` | `true` while that button is held. |

Releasing a button outside the screen still sends an `"up"`, at the last known position, so drags can't get stuck.

```js
s.onMouse(e => {
    if (e.type == "down" && e.button == 0) s.put(e.x, e.y, "#", { fg: "orange" })
})
```

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
| `s.close()` | Stops the loop, removes all handlers and removes the screen. When the last screen closes, you're back in the terminal. |

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
