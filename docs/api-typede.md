# TypeDE app API

TypeDE is the desktop environment for TypeOS (`typede.js`). Apps for it are plain
JavaScript files. Drop one into the plugin folder and it shows up in the start menu.

- [Quick start](#quick-start)
- [`registerApp`](#registerappdef)
- [The `de` object](#the-de-object)
- [Windows](#windows)
- [Dialogs and notifications](#dialogs-and-notifications)
- [File picker](#file-picker)
- [Context menus](#context-menus)
- [Settings](#settings)
- [Building the UI: `h()`, icons and styling](#building-the-ui)
- [TypeOS functions inside apps](#typeos-functions-inside-apps)
- [Lifecycle and cleanup](#lifecycle-and-cleanup)
- [Examples](#examples)

## Quick start

Apps live in:

```
~/.local/share/typede/apps/
```

Every `*.js` file in that folder is loaded when the desktop starts. After you add or
change a file, press the reload button next to the start menu search box
(or **Settings → About → Reload apps**).

Smallest possible app:

```js
// ~/.local/share/typede/apps/hello.js
registerApp({
  id: "hello",
  name: "Hello",
  description: "Says hello",
  icon: "info",
  color: "#e67e22",
  category: "Utilities",
  launch(de) {
    const win = de.createWindow({ title: "Hello", width: 360, height: 200 })
    win.body.append(de.h("div", { style: { padding: "24px", fontSize: "20px" }, text: "Hello, " + de.user + "!" }))
  },
})
```

A plugin file is run like a function body. These names are available inside it:

| Name | What it is |
| --- | --- |
| `registerApp` | Registers your app (see below) |
| `de` | The desktop API (see [The `de` object](#the-de-object)) |
| `os` | The TypeOS functions as one object (`os.readFile(...)`) |
| `print`, `readFile`, `writeFile`, ... | The TypeOS functions as plain globals ([list](#typeos-functions-inside-apps)) |

The file may start with a `#!js` line like any TypeOS script. If a plugin throws while
loading, the desktop shows a notification with the file name and the error, and the other
plugins still load.

## registerApp(def)

```js
registerApp({
  id: "notes",                 // required, unique
  name: "Notes",               // required, shown in the start menu and the taskbar
  description: "Quick notes",  // shown under the name in the start menu (searchable)
  icon: "edit",                // built-in icon name, an emoji, or an inline <svg>
  color: "#27ae60",            // colour of the rounded tile behind the icon
  category: "Utilities",       // start menu group; any text, new groups are created on demand
  single: true,                // optional: only one window of this app at a time
  launch(de, params) { ... },  // required, called when the app starts
  relaunch(win, params) { ... }, // optional, see "single" below
})
```

| Field | Required | Description |
| --- | --- | --- |
| `id` | yes | Unique id. Using the id of a built-in app throws an error. Built-in ids: `files`, `editor`, `terminal`, `settings`, `taskmgr`, `sysmon`, `calculator`, `clock`, `paint`, `piano`, `snake`, `minesweeper`. |
| `name` | yes | Display name. |
| `launch` | yes | `launch(de, params)`. Create your window here. May be `async`; if it throws or rejects, the user gets a "crashed" notification instead of a broken desktop. |
| `description` | no | One line of help text. |
| `icon` | no | Default `"apps"`. See [Icons](#icons). |
| `color` | no | Default `"#3daee9"`. Any CSS colour. |
| `category` | no | Default `"Applications"`. Built-in groups are System, Utilities, Games, Graphics and Multimedia. |
| `single` | no | If `true` and a window of the app is already open, launching just focuses it. |
| `relaunch` | no | With `single`, called as `relaunch(existingWindow, params)` when the app is launched again, so it can react to the new `params`. |

`params` is whatever was passed to `de.launch(id, params)`. Launching from the start menu
passes nothing (`undefined`).

## The `de` object

| Member | Description |
| --- | --- |
| `de.version` | TypeDE version string. |
| `de.user`, `de.home` | Current user name and home folder (`/home/<user>`). |
| `de.registerApp(def)` | Same function as the global `registerApp`. |
| `de.launch(id, params?)` | Start any app by id. Returns what its `launch` returned (usually the window). |
| `de.apps()` | Array of all registered app definitions. |
| `de.createWindow(opts)` | Open a window ([details](#windows)). |
| `de.windows()` | Array of all open windows. |
| `de.focusWindow(win)` | Bring a window to the front (restores it if minimized). |
| `de.dialog.alert / confirm / prompt / choose` | In-desktop dialogs, all return promises ([details](#dialogs-and-notifications)). |
| `de.notify(title, text?, ms?)` | Toast notification above the panel. |
| `de.pickFile(opts)` | Open / save / folder picker ([details](#file-picker)). |
| `de.contextMenu(x, y, items)` | Show a context menu ([details](#context-menus)). |
| `de.settings` | Read and change desktop settings ([details](#settings)). |
| `de.sound(freq, ms)` | Short beep that respects the user's "Sound effects" setting. |
| `de.openFile(path?)` | Open a file in the Text Editor (focuses it if it is already open). |
| `de.openFolder(path?)` | Open a Files window at `path` (default: home). |
| `de.switchToTerminal()` | Hide the desktop and return to the shell. |
| `de.logout()` | Ask to close everything and end the session. |
| `de.os` | The TypeOS functions as an object. |
| `de.path` | `resolve(base, p)`, `dirname(p)`, `basename(p)`, `join(a, b)`. All paths are absolute and `/`-separated. |
| `de.h(tag, props, ...kids)` | DOM helper ([details](#building-the-ui)). |
| `de.icon(name, size?)` | Returns an inline SVG string for a built-in icon. |

## Windows

```js
const win = de.createWindow({
  title: "My window",   // default: the app name
  width: 640,           // default 720
  height: 420,          // default 480
  minWidth: 300,        // default 300
  minHeight: 180,       // default 180
  x: 100, y: 80,        // optional, default: cascaded near the centre
  icon: "edit",         // optional, defaults to your app's icon and colour
  color: "#27ae60",
})
```

The window is shown immediately and focused. Put your content in `win.body`: a
flex column that fills the area under the title bar, so a child with `flex: 1` fills it.

| Member | Description |
| --- | --- |
| `win.body` | The content element. Append your UI here. |
| `win.title` / `win.setTitle(text)` | Current title; `setTitle` updates the title bar and the taskbar. |
| `win.appId` | Id of the app that opened it. |
| `win.close()` | Close it (runs `beforeClose` first). Returns a promise resolving to `true` if it closed. |
| `win.focus()` | Focus and un-minimize. |
| `win.minimize()` | Minimize to the taskbar. |
| `win.beforeClose` | `async () => boolean`. Return `false` to cancel closing, for example to ask about unsaved changes. |
| `win.onClosed` | `() => void`. Called after the window is closed. Clear timers here. |

Inside `launch`, `createWindow` automatically uses your app's id, icon and colour. If you
create a window *after* an `await`, pass `appId: "your-id"` explicitly so it is still
attributed to your app.

Users can drag, resize, minimize, maximize and snap windows. You do not need to
implement any of that.

```js
// ask before closing
win.beforeClose = async () => dirty ? await de.dialog.confirm("Discard your changes?", { danger: true, okText: "Discard" }) : true
```

## Dialogs and notifications

Dialogs are modal and appear above everything. Escape cancels.

```js
await de.dialog.alert("Saved!", "Notes")                                   // -> undefined
const yes = await de.dialog.confirm("Delete it?", { title: "Delete", okText: "Delete", danger: true })  // -> true / false
const name = await de.dialog.prompt("Your name:", { title: "Hi", value: "Ada", placeholder: "name" })    // -> string / null
const choice = await de.dialog.choose("Save changes?", [
  { label: "Save",    value: "save", kind: "primary" },
  { label: "Discard", value: "discard", kind: "danger" },
  { label: "Cancel",  value: "cancel" },
], { title: "Unsaved changes" })                                            // -> the clicked value, or null on Escape
```

`kind` can be `"primary"`, `"danger"` or empty. Enter in a text field activates the first
primary/danger button.

```js
de.notify("Done", "Exported 3 files")        // title, optional text, optional duration in ms (default 4500)
```

## File picker

`de.pickFile(options)` opens a file dialog and resolves with an absolute path, or `null` if
the user cancels.

```js
const file   = await de.pickFile({ mode: "open",   title: "Open a text file", extensions: [".txt", ".md"] })
const target = await de.pickFile({ mode: "save",   title: "Save as", path: de.home, name: "notes.txt" })
const folder = await de.pickFile({ mode: "folder", title: "Choose a folder" })
```

| Option | Description |
| --- | --- |
| `mode` | `"open"` (default): pick an existing file. `"save"`: pick a folder and type a name; asks before overwriting. `"folder"`: pick a folder. |
| `title` | Dialog title. |
| `path` | Where to start. A folder, or a file path (then its folder is shown). Default: home. |
| `name` | `"save"` only: the pre-filled file name. |
| `extensions` | Optional array such as `[".txt", ".md"]`; other files are hidden (folders always show). |

The picker only returns the path; reading and writing is up to you:

```js
const p = await de.pickFile({ mode: "open" })
if (p) text = await readFile(p)
```

## Context menus

```js
de.contextMenu(event.clientX, event.clientY, [
  { label: "Open",      icon: "folder", action: () => open() },
  { label: "Rename…",   icon: "rename", action: () => rename() },
  "-",                                         // separator
  { label: "Read only", checked: readOnly, action: () => toggle() },
  { label: "Delete",    icon: "trash", disabled: !canDelete, action: () => remove() },
])
```

Items: `label`, `action`, optional `icon` (built-in name), `checked` (shows a tick) and
`disabled`. Use `event.preventDefault()` in your `contextmenu` handler. The menu closes
when the user clicks anywhere else.

## Settings

Users change settings in the Settings app; your app can read them and react.

```js
de.settings.get("accent")                 // "#3daee9"
de.settings.set("accent", "#e67e22")      // applies and saves it
const stop = de.settings.onChange((key, value) => { ... })   // key is null after "Reset settings"
stop()                                    // unsubscribe
```

| Key | Type | Meaning |
| --- | --- | --- |
| `accent` | `"#rrggbb"` | Accent colour |
| `wallpaper` | string | `aurora`, `plasma`, `sunset`, `forest`, `midnight`, `graphite` or `solid` |
| `wallpaperColor` | `"#rrggbb"` | Colour used by `solid` |
| `wallpaperUrl` | string | Optional wallpaper image URL (empty = none) |
| `animations` | boolean | Window animations |
| `desktopIcons` | boolean | Icons on the desktop |
| `snapping` | boolean | Snap windows at screen edges |
| `confirmLogout` | boolean | Ask before logging out |
| `sound` | boolean | Sound effects (`de.sound` honours this) |
| `clockFormat` | `"auto"`, `"24h"`, `"12h"` | Panel clock format |
| `clockSeconds` | boolean | Show seconds |
| `clockDate` | boolean | Show the date under the time |

`set` throws for unknown keys; to store your own data use `storage` (below).
Settings are saved with the TypeOS `storage` API under the key `settings`.

## Building the UI

### `de.h(tag, props, ...children)`

Creates a DOM element.

```js
const { h } = de
const button = h("button", { class: "btn primary", text: "Click me", onClick: () => de.notify("Clicked") })
const card = h("div", { class: "card", style: { padding: "12px" } }, h("b", { text: "Title" }), " and some text", button)
```

| Prop | Effect |
| --- | --- |
| `class` | `className` |
| `text` | `textContent` (safe: no HTML parsing) |
| `html` | `innerHTML` (only use with strings you trust) |
| `style` | An object assigned to `el.style` |
| `onClick`, `onInput`, `onKeyDown`, `onPointerDown`, ... | Event listeners (`onXxx` becomes the event `xxx`, lower-cased) |
| anything else | Set as an attribute (`true` sets an empty attribute; `false`, `null` and `undefined` skip it) |

Children can be elements, strings, arrays (flattened), or `null`/`false` (skipped).

Plain DOM works too: `win.body` is a normal element, so `document.createElement`,
`canvas`, `addEventListener` and so on are all available.

### Icons

`icon` in `registerApp`, `createWindow` and context menu items can be:

- a built-in name:
  `folder file edit terminal apps back forward up home refresh trash save power logout search user wifi battery newfile newfolder rename list grid eye hdd clock calculator settings activity cpu tasks gamepad music palette info play undo download eraser line circle pen min max restore close`
- an emoji, for example `"🎲"`
- an inline SVG string, for example `'<svg viewBox="0 0 24 24" width="20" height="20">…</svg>'`

`de.icon(name, size)` returns the SVG string of a built-in icon if you want one in your own UI:
`h("span", { html: de.icon("save", 16) })`. Built-in icons are stroke icons that use
`currentColor`.

### Styling

Everything runs inside a shadow root, so the page's CSS never affects your app and yours
never leaks out. Put a `<style>` in your window to style it:

```js
win.body.append(h("style", { text: ".my-app b { color: var(--accent) }" }), h("div", { class: "my-app" }, h("b", { text: "Hi" })))
```

CSS variables you can use (they follow the user's accent setting):

| Variable | Use |
| --- | --- |
| `--bg` | Window background |
| `--bg2` | Darker panels and sidebars |
| `--view` | Input and list backgrounds |
| `--fg`, `--dim` | Text and secondary text |
| `--accent`, `--accent-soft`, `--accent-mid`, `--accent-line` | Accent colour and translucent versions |
| `--line` | Borders and dividers |
| `--hover` | Hover background |
| `--danger` | Destructive actions |
| `--mono` | Monospace font stack |

Ready-made classes: `btn`, `btn primary`, `btn danger`, `ibtn` (icon button), `tbtn`
(icon and label toolbar button), `set-input` and `set-select` (text inputs and dropdowns),
`menu-empty` (centred "nothing here" text), `set-desc` (small grey text).

## TypeOS functions inside apps

These work exactly as documented in the TypeOS API and are available both as globals and
as properties of `os`:

`print printf readFile writeFile deleteFile listFiles cwd resolvePath whoami env run sleep now random randInt beep storage`

Newer TypeOS builds also have these (see `docs/api.md` in the TypeOS repo). They are
available **only on the `os` object** (so they can never clash with a variable you declare
yourself), and only when the running TypeOS has them, so check `os.stat` etc. if you want
to support old builds:

`os.exists os.isDir os.stat os.mkdir os.rmdir os.copy os.move os.chmod os.watch os.setEnv os.hostname os.users os.uptime os.disk os.isMobile`

| Function | Notes |
| --- | --- |
| `os.exists(p)` / `os.isDir(p)` | `true`/`false`. |
| `os.stat(p)` | `{ type: "file" \| "dir", size, executable }` or `null`. |
| `os.mkdir(p)` | Creates a folder. |
| `os.rmdir(p)` | Deletes a folder **and everything in it**. |
| `os.copy(from, to)` / `os.move(from, to)` | **Files only.** They throw `no such file` for a folder, so copy a folder by walking it with `listFiles`. |
| `os.watch(path, cb)` | `cb(path, data)` on changes inside `path`. Returns a stop function: **call it when your window closes**, because watchers outlive scripts (`win.onClosed = stop`). |
| `os.disk()` | `{ used, total, files }` in bytes. |
| `os.hostname()`, `os.uptime()` | Machine name; seconds since TypeOS booted. |

These take the path as one argument, so **spaces in names are fine**. Permissions are the
same as the shell: a normal user can only write inside their own home and anything else
throws `permission denied`.

```js
const stop = os.watch?.(de.home, () => refreshMyList()) ?? (() => {})
win.onClosed = stop
```

Not available inside apps: `input`, `screen`, `args`, `exit`, `restart`, `launch` (the
desktop owns the screen and the keyboard). `print` writes to the terminal, which is hidden
while the desktop is showing.

Every file function may throw (`permission denied`, and so on), so wrap writes in
`try/catch` and show the message:

```js
try { await writeFile(path, text) } catch (e) { await de.dialog.alert(e.message, "Cannot save") }
```

`await` is fine on every TypeOS function, whether or not it returns a promise.

`run(line)` goes through the TypeOS shell. Two things to know:

- It splits the line on whitespace, so it cannot handle paths with spaces. Prefer the
  native functions above for files.
- It **does not return the command's output**: output is printed to the terminal, which is
  hidden while the desktop shows. It also usually **does not throw** when a command fails
  (for example `permission denied (try sudo)` is only printed). If you need to know whether
  it worked, check the result yourself (for example `os.stat(path)` after `mkdir`).

TypeDE's own **Shut Down** uses this: it runs `shutdown` (root) or `sudo shutdown` (any
other user), then checks that TypeOS really powered off before removing the desktop.

### Saving your app's data

`storage.get(key)` / `storage.set(key, value)` save JSON per script. All plugins (and
TypeDE itself) share the `typede` namespace, so **prefix your keys with your app id**:

```js
const best = (await storage.get("mygame-best")) ?? 0
await storage.set("mygame-best", 42)
```

## Lifecycle and cleanup

- `launch` runs every time the app is started. Without `single: true`, users can open several windows of it, so keep per-window state inside `launch`.
- Windows can be minimized; they keep running. Timers and animation frames keep ticking, so clear them in `win.onClosed`:

```js
const timer = setInterval(update, 1000)
win.onClosed = () => clearInterval(timer)
```

- Logging out closes all windows (each `beforeClose` runs and can cancel). **Switch to Terminal** only hides the desktop; windows and timers stay alive until the user comes back.
- Reloading apps removes every plugin app and loads the folder again. Windows that are already open keep running their old code.

## Examples

Each example is a complete file for `~/.local/share/typede/apps/`.

### Counter with a saved best score

```js
// ~/.local/share/typede/apps/clicker.js
registerApp({
  id: "clicker", name: "Clicker", description: "Click as fast as you can", icon: "🖱️", color: "#8e44ad", category: "Games", single: true,
  launch(de) {
    const { h } = de
    const win = de.createWindow({ title: "Clicker", width: 320, height: 260, minWidth: 280, minHeight: 240 })
    let count = 0, best = 0
    const countEl = h("div", { style: { fontSize: "56px", fontWeight: "300" }, text: "0" })
    const bestEl = h("div", { class: "set-desc", text: "Best: 0" })
    Promise.resolve(storage.get("clicker-best")).then(v => { if (typeof v === "number") { best = v; bestEl.textContent = "Best: " + v } })
    const btn = h("button", { class: "btn primary", style: { height: "44px", padding: "0 28px", fontSize: "16px" }, text: "Click!",
      onClick: () => {
        countEl.textContent = String(++count)
        de.sound(440 + count * 10, 40)
        if (count > best) { best = count; bestEl.textContent = "Best: " + best; storage.set("clicker-best", best) }
      } })
    win.body.append(h("div", { style: { flex: "1", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px" } },
      countEl, btn, bestEl, h("button", { class: "btn", text: "Reset", onClick: () => { count = 0; countEl.textContent = "0" } })))
  },
})
```

### Word counter (file picker + reading files)

```js
// ~/.local/share/typede/apps/wordcount.js
registerApp({
  id: "wordcount", name: "Word Counter", description: "Count words in a text file", icon: "list", color: "#16a085", category: "Utilities",
  launch(de) {
    const { h } = de
    const win = de.createWindow({ title: "Word Counter", width: 420, height: 260 })
    const result = h("div", { style: { padding: "16px", whiteSpace: "pre-wrap", color: "var(--dim)" }, text: "Choose a file to count its words." })
    async function choose() {
      const path = await de.pickFile({ mode: "open", title: "Choose a text file", extensions: [".txt", ".md"] })
      if (!path) return
      try {
        const text = await readFile(path)
        if (text === null) throw new Error("File not found")
        const words = (text.match(/\S+/g) || []).length
        result.textContent = `${de.path.basename(path)}\n${words} words, ${text.length} characters, ${text.split("\n").length} lines`
        win.setTitle(de.path.basename(path) + " — Word Counter")
      } catch (e) { await de.dialog.alert(e.message, "Cannot read file") }
    }
    win.body.append(h("div", { style: { padding: "12px" } }, h("button", { class: "btn primary", text: "Choose file…", onClick: choose })), result)
  },
})
```

### Live app with a timer, cleanup and a context menu

```js
// ~/.local/share/typede/apps/uptime.js
registerApp({
  id: "uptime", name: "Uptime", description: "A live clock that you can pause", icon: "clock", color: "#2980b9", category: "Utilities",
  launch(de) {
    const { h } = de
    const win = de.createWindow({ title: "Uptime", width: 340, height: 180 })
    const started = Date.now()
    let paused = false
    const out = h("div", { style: { flex: "1", display: "grid", placeItems: "center", fontSize: "40px", fontVariantNumeric: "tabular-nums" } })
    const timer = setInterval(() => {
      if (paused) return
      const s = Math.floor((Date.now() - started) / 1000)
      out.textContent = [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(n => String(n).padStart(2, "0")).join(":")
    }, 250)
    win.onClosed = () => clearInterval(timer)                  // always clean up
    out.addEventListener("contextmenu", e => {
      e.preventDefault()
      de.contextMenu(e.clientX, e.clientY, [
        { label: "Pause", checked: paused, action: () => { paused = !paused } },
        { label: "Open Files", icon: "folder", action: () => de.openFolder(de.home) },
      ])
    })
    win.body.append(out)
  },
})
```

### Reacting to settings

```js
// ~/.local/share/typede/apps/accentdemo.js
registerApp({
  id: "accentdemo", name: "Accent Demo", description: "Shows the current accent colour", icon: "palette", color: "#d35400", category: "Graphics", single: true,
  launch(de) {
    const { h } = de
    const win = de.createWindow({ title: "Accent Demo", width: 300, height: 160 })
    const label = h("div", { style: { fontSize: "18px" } })
    const swatch = h("div", { style: { width: "64px", height: "64px", borderRadius: "50%" } })
    const paint = () => { swatch.style.background = de.settings.get("accent"); label.textContent = de.settings.get("accent") }
    paint()
    const stop = de.settings.onChange(paint)
    win.onClosed = stop
    win.body.append(h("div", { style: { flex: "1", display: "flex", alignItems: "center", justifyContent: "center", gap: "16px" } }, swatch, label))
  },
})
```

Change the accent colour in Settings while this window is open and it follows along.
