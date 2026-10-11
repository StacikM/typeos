type Style = { fg? : string, bg? : string }
type Cell = { ch : string, fg : string, bg : string }
type MouseInfo = { type : "down" | "up" | "move" | "wheel", x : number, y : number, button : number, delta : number }

// x/y/w/h are in cells of the page font. leave them out for a fullscreen screen
export type ScreenOptions = {
    x? : number,
    y? : number,
    w? : number,
    h? : number,
    title? : string,
    draggable? : boolean,
    bottom? : boolean, // always stays under other screens, for desktops/wallpapers
}

type Instance = {
    div : HTMLDivElement,
    bottom : boolean,
    held : Set<string>,
    mouseButtons : Set<number>,
    key(key : string, ctrl : boolean) : void,
    keyUp(key : string) : void,
    mouseUp(e : MouseEvent) : void,
    resized() : void,
    focusChanged(focused : boolean) : void,
}

const screens : Instance[] = []
let focused : Instance | null = null
let topZ = 100

// page font cell size, used to place windows on the same grid apps draw on
const pageMeasurer = document.createElement("span")
pageMeasurer.textContent = "M"
pageMeasurer.style.position = "absolute"
pageMeasurer.style.visibility = "hidden"
pageMeasurer.style.whiteSpace = "pre"
document.body.append(pageMeasurer)

function pageCell() {
    const r = pageMeasurer.getBoundingClientRect()
    return { w: r.width || 8, h: r.height || 16 }
}

// single chars are lowercased so shift doesn't leave "A" stuck when "a" gets released
function normKey(key : string) {
    return key.length == 1 ? key.toLowerCase() : key
}

function escape(s : string) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function setFocus(s : Instance | null) {
    if (focused == s) { return }
    focused?.focusChanged(false)
    focused = s
    if (s) {
        if (!s.bottom) { s.div.style.zIndex = String(++topZ) }
        s.focusChanged(true)
    }
}

function topmost() {
    let best : Instance | null = null
    for (const s of screens) {
        if (!best || Number(s.div.style.zIndex) > Number(best.div.style.zIndex)) { best = s }
    }
    return best
}

document.addEventListener("keydown", (e) => {
    focused?.held.add(normKey(e.key))
})

// released keys get cleared everywhere, so switching focus mid press can't leave one stuck
document.addEventListener("keyup", (e) => {
    for (const s of screens) { s.held.delete(normKey(e.key)) }
    focused?.keyUp(e.key)
})

window.addEventListener("blur", () => {
    for (const s of screens) { s.held.clear(); s.mouseButtons.clear() }
})

window.addEventListener("resize", () => {
    for (const s of screens) { s.resized() }
})

// on document so letting go outside the screen still counts
document.addEventListener("mouseup", (e) => {
    for (const s of [...screens]) {
        if (s.mouseButtons.has(e.button)) { s.mouseUp(e) }
    }
})

export function isScreenOpen() {
    return screens.length > 0
}

export function feedKey(key : string, ctrl : boolean) {
    focused?.key(key, ctrl)
}

export function feedPaste(pasted : string) {
    for (const ch of pasted) { feedKey(ch, false) }
}

export function openScreen(opts : ScreenOptions = {}) {
    const isWindow = opts.w != null && opts.h != null

    let keyHandler : ((key : string, ctrl : boolean) => void) | null = null
    let keyUpHandler : ((key : string) => void) | null = null
    let resizeHandler : ((cols : number, rows : number) => void) | null = null
    let mouseHandler : ((e : MouseInfo) => void) | null = null
    let focusHandler : ((focused : boolean) => void) | null = null
    let pendingRead : ((k : { key : string, ctrl : boolean }) => void) | null = null
    const queue : { key : string, ctrl : boolean }[] = []
    const mouse = { x: -1, y: -1 }
    let lastSize = { cols: 0, rows: 0 }
    let closed = false

    let loopId : number | null = null
    let loopDone : { resolve : () => void, reject : (e : unknown) => void } | null = null

    let cells : Cell[][] = []
    let dirty = false

    let pos = { x: opts.x ?? 0, y: opts.y ?? 0, w: opts.w ?? 0, h: opts.h ?? 0 }
    let drag : { dx : number, dy : number } | null = null

    const div = document.createElement("div")
    div.className = "screen" + (isWindow ? " window" : "")

    const header = document.createElement("p")
    header.className = "bar"

    const body = document.createElement("pre")
    const content = document.createElement("span")
    // one hidden char, used to work out how many cols/rows fit
    const measurer = document.createElement("span")
    measurer.textContent = "M"
    measurer.style.position = "absolute"
    measurer.style.visibility = "hidden"
    body.append(content, measurer)

    const footer = document.createElement("p")
    footer.className = "bar"

    header.style.display = "none"
    footer.style.display = "none"
    div.append(header, body, footer)

    function place() {
        if (!isWindow) { return }
        const c = pageCell()
        div.style.left = pos.x * c.w + "px"
        div.style.top = pos.y * c.h + "px"
        div.style.width = pos.w * c.w + "px"
        div.style.height = pos.h * c.h + "px"
    }

    function getSize() {
        const rect = measurer.getBoundingClientRect()
        const css = getComputedStyle(body)
        const w = body.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight)
        const h = body.clientHeight - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom)
        return {
            cols: Math.max(1, Math.floor(w / (rect.width || 1))),
            rows: Math.max(1, Math.floor(h / (rect.height || 1))),
        }
    }

    function blank() : Cell {
        return { ch: " ", fg: "", bg: "" }
    }

    function resizeCells(cols : number, rows : number) {
        const next : Cell[][] = []
        for (let y = 0; y < rows; y++) {
            const row : Cell[] = []
            for (let x = 0; x < cols; x++) { row.push(cells[y]?.[x] ?? blank()) }
            next.push(row)
        }
        cells = next
        dirty = true
    }

    function ensureCells() {
        if (cells.length == 0) {
            const { cols, rows } = getSize()
            resizeCells(cols, rows)
        }
    }

    // called whenever something might have changed the grid size
    function resized() {
        const size = getSize()
        if (size.cols == lastSize.cols && size.rows == lastSize.rows) { return }
        lastSize = size
        if (cells.length) { resizeCells(size.cols, size.rows) }
        resizeHandler?.(size.cols, size.rows)
    }

    function setCell(x : number, y : number, ch : string, style : Style) {
        x = Math.floor(x)
        y = Math.floor(y)
        const row = cells[y]
        if (!row || x < 0 || x >= row.length) { return }
        row[x] = { ch: ch || " ", fg: style.fg ?? "", bg: style.bg ?? "" }
        dirty = true
    }

    function flush() {
        if (!dirty) { return }
        dirty = false
        // group neighbouring cells with the same colors into one span
        let html = ""
        for (let y = 0; y < cells.length; y++) {
            const row = cells[y]
            let x = 0
            while (x < row.length) {
                const { fg, bg } = row[x]
                let run = ""
                while (x < row.length && row[x].fg == fg && row[x].bg == bg) { run += row[x].ch; x++ }
                if (fg || bg) {
                    const style = (fg ? "color:" + fg + ";" : "") + (bg ? "background:" + bg + ";" : "")
                    html += '<span style="' + escape(style) + '">' + escape(run) + "</span>"
                } else {
                    html += escape(run)
                }
            }
            if (y < cells.length - 1) { html += "\n" }
        }
        content.innerHTML = html
    }

    function stopLoop(err? : unknown) {
        if (loopId != null) { cancelAnimationFrame(loopId) }
        loopId = null
        const done = loopDone
        loopDone = null
        if (done) { err === undefined ? done.resolve() : done.reject(err) }
    }

    // pixel position -> cell, or null when it's outside the grid (bars, padding)
    function toCell(clientX : number, clientY : number) {
        const rect = body.getBoundingClientRect()
        const char = measurer.getBoundingClientRect()
        const css = getComputedStyle(body)
        const { cols, rows } = getSize()
        const x = Math.floor((clientX - rect.left - parseFloat(css.paddingLeft)) / (char.width || 1))
        const y = Math.floor((clientY - rect.top - parseFloat(css.paddingTop) + body.scrollTop) / (char.height || 1))
        if (x < 0 || y < 0 || x >= cols || y >= rows) { return null }
        return { x, y }
    }

    function emitMouse(type : MouseInfo["type"], e : MouseEvent, delta : number = 0) {
        const cell = toCell(e.clientX, e.clientY)
        if (!cell) { return false }
        if (type == "move" && cell.x == mouse.x && cell.y == mouse.y) { return true }
        mouse.x = cell.x
        mouse.y = cell.y
        mouseHandler?.({ type, x: cell.x, y: cell.y, button: e.button, delta })
        return true
    }

    const inst : Instance = {
        div,
        bottom: opts.bottom ?? false,
        held: new Set(),
        mouseButtons: new Set(),
        key(key, ctrl) {
            if (pendingRead) {
                const resolve = pendingRead
                pendingRead = null
                resolve({ key, ctrl })
            } else if (keyHandler) {
                keyHandler(key, ctrl)
            } else {
                queue.push({ key, ctrl })
            }
        },
        keyUp(key) {
            keyUpHandler?.(key)
        },
        mouseUp(e) {
            inst.mouseButtons.delete(e.button)
            if (!emitMouse("up", e)) { mouseHandler?.({ type: "up", x: mouse.x, y: mouse.y, button: e.button, delta: 0 }) }
        },
        resized,
        focusChanged(f) {
            div.classList.toggle("focused", f)
            if (!f) { inst.held.clear() }
            focusHandler?.(f)
        },
    }

    // clicking anywhere on a screen focuses it, like a window manager would
    div.addEventListener("mousedown", () => setFocus(inst))

    body.addEventListener("mousedown", (e) => {
        if (emitMouse("down", e)) { inst.mouseButtons.add(e.button) }
    })
    body.addEventListener("mousemove", (e) => { emitMouse("move", e) })
    body.addEventListener("wheel", (e) => {
        if (mouseHandler) { e.preventDefault() }
        emitMouse("wheel", e, Math.sign(e.deltaY))
    }, { passive: false })
    body.addEventListener("contextmenu", (e) => {
        if (mouseHandler) { e.preventDefault() }
    })

    // dragging a window by its header, snapped to the cell grid
    header.addEventListener("mousedown", (e) => {
        if (!isWindow || opts.draggable === false || e.button != 0) { return }
        const c = pageCell()
        drag = { dx: e.clientX - pos.x * c.w, dy: e.clientY - pos.y * c.h }
        e.preventDefault()
    })
    const onDragMove = (e : MouseEvent) => {
        if (!drag) { return }
        const c = pageCell()
        pos.x = Math.round((e.clientX - drag.dx) / c.w)
        pos.y = Math.max(0, Math.round((e.clientY - drag.dy) / c.h))
        place()
    }
    const onDragEnd = () => { drag = null }
    document.addEventListener("mousemove", onDragMove)
    document.addEventListener("mouseup", onDragEnd)

    if (isWindow) { div.style.zIndex = String(inst.bottom ? 1 : ++topZ) } else { div.style.zIndex = String(inst.bottom ? 0 : ++topZ) }
    place()
    document.body.append(div)
    screens.push(inst)
    setFocus(inst)
    lastSize = getSize()

    const api = {
        render(text : string) {
            content.textContent = text
        },
        setHeader(text : string) {
            header.textContent = text
            header.style.display = text ? "" : "none"
            resized()
        },
        setFooter(text : string) {
            footer.textContent = text
            footer.style.display = text ? "" : "none"
            resized()
        },
        onKey(cb : (key : string, ctrl : boolean) => void) {
            keyHandler = cb
        },
        onKeyUp(cb : (key : string) => void) {
            keyUpHandler = cb
        },
        isDown(key : string) {
            return inst.held.has(normKey(key))
        },
        // type is "down" | "up" | "move" | "wheel", delta is -1/1 for wheel
        onMouse(cb : (e : MouseInfo) => void) {
            mouseHandler = cb
            div.style.userSelect = "none"
        },
        mouse() {
            return { x: mouse.x, y: mouse.y, down: inst.mouseButtons.has(0) }
        },
        isMouseDown(button : number = 0) {
            return inst.mouseButtons.has(button)
        },
        readKey() : Promise<{ key : string, ctrl : boolean }> {
            return new Promise((resolve) => {
                const next = queue.shift()
                if (next) { resolve(next) } else { pendingRead = resolve }
            })
        },
        size() {
            return getSize()
        },
        onResize(cb : (cols : number, rows : number) => void) {
            resizeHandler = cb
        },
        // resolves when stopLoop()/close() is called, rejects if the callback throws
        loop(cb : (dt : number) => void) : Promise<void> {
            stopLoop()
            return new Promise((resolve, reject) => {
                loopDone = { resolve, reject }
                let last = performance.now()
                const tick = (t : number) => {
                    const dt = t - last
                    last = t
                    try {
                        cb(dt)
                        flush()
                    } catch (e) {
                        stopLoop(e)
                        return
                    }
                    if (loopDone) { loopId = requestAnimationFrame(tick) }
                }
                loopId = requestAnimationFrame(tick)
            })
        },
        stopLoop() {
            stopLoop()
        },
        put(x : number, y : number, ch : string, style : Style = {}) {
            ensureCells()
            setCell(x, y, ch[0], style)
        },
        text(x : number, y : number, str : string, style : Style = {}) {
            ensureCells()
            for (let i = 0; i < str.length; i++) { setCell(x + i, y, str[i], style) }
        },
        fill(x : number, y : number, w : number, h : number, ch : string = " ", style : Style = {}) {
            ensureCells()
            for (let dy = 0; dy < h; dy++) {
                for (let dx = 0; dx < w; dx++) { setCell(x + dx, y + dy, ch[0], style) }
            }
        },
        clear() {
            ensureCells()
            for (const row of cells) { row.fill(blank()) }
            dirty = true
        },
        flush() {
            flush()
        },
        // window only: position and size in page cells
        move(x : number, y : number) {
            pos.x = x
            pos.y = y
            place()
        },
        resize(w : number, h : number) {
            if (!isWindow) { return }
            pos.w = w
            pos.h = h
            place()
            resized()
        },
        rect() {
            return { ...pos }
        },
        focus() {
            if (!closed) { setFocus(inst) }
        },
        isFocused() {
            return focused == inst
        },
        onFocus(cb : (focused : boolean) => void) {
            focusHandler = cb
        },
        isOpen() {
            return !closed
        },
        close() {
            if (closed) { return }
            closed = true
            stopLoop()
            keyHandler = null
            keyUpHandler = null
            resizeHandler = null
            mouseHandler = null
            focusHandler = null
            pendingRead = null
            queue.length = 0
            cells = []
            document.removeEventListener("mousemove", onDragMove)
            document.removeEventListener("mouseup", onDragEnd)
            div.remove()
            screens.splice(screens.indexOf(inst), 1)
            if (focused == inst) {
                focused = null
                setFocus(topmost())
            }
        }
    }

    if (opts.title) { api.setHeader(opts.title) }
    return api
}
