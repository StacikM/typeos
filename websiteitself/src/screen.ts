let active = false
let keyHandler : ((key : string, ctrl : boolean) => void) | null = null
let keyUpHandler : ((key : string) => void) | null = null
type MouseInfo = { type : "down" | "up" | "move" | "wheel", x : number, y : number, button : number, delta : number }
let mouseHandler : ((e : MouseInfo) => void) | null = null
const mouse = { x: -1, y: -1, buttons: new Set<number>() }
let resizeHandler : ((cols : number, rows : number) => void) | null = null
let pendingRead : ((k : { key : string, ctrl : boolean }) => void) | null = null
const queue : { key : string, ctrl : boolean }[] = []
const held = new Set<string>()

let loopId : number | null = null
let loopDone : { resolve : () => void, reject : (e : unknown) => void } | null = null

type Style = { fg? : string, bg? : string }
type Cell = { ch : string, fg : string, bg : string }
let cells : Cell[][] = []
let dirty = false

const screenDiv = document.createElement("div")
screenDiv.id = "screen"

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

screenDiv.append(header, body, footer)

// single chars are lowercased so shift doesn't leave "A" stuck when "a" gets released
function normKey(key : string) {
    return key.length == 1 ? key.toLowerCase() : key
}

document.addEventListener("keydown", (e) => {
    if (active) { held.add(normKey(e.key)) }
})

document.addEventListener("keyup", (e) => {
    if (!active) { return }
    held.delete(normKey(e.key))
    keyUpHandler?.(e.key)
})

window.addEventListener("blur", () => { held.clear(); mouse.buttons.clear() })

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

body.addEventListener("mousedown", (e) => {
    if (emitMouse("down", e)) { mouse.buttons.add(e.button) }
})

// on document so letting go outside the screen still counts
document.addEventListener("mouseup", (e) => {
    if (!active || !mouse.buttons.has(e.button)) { return }
    mouse.buttons.delete(e.button)
    if (!emitMouse("up", e)) { mouseHandler?.({ type: "up", x: mouse.x, y: mouse.y, button: e.button, delta: 0 }) }
})

body.addEventListener("mousemove", (e) => { emitMouse("move", e) })

body.addEventListener("wheel", (e) => {
    if (mouseHandler) { e.preventDefault() }
    emitMouse("wheel", e, Math.sign(e.deltaY))
}, { passive: false })

body.addEventListener("contextmenu", (e) => {
    if (mouseHandler) { e.preventDefault() }
})

function resetMouse() {
    mouseHandler = null
    mouse.x = -1
    mouse.y = -1
    mouse.buttons.clear()
    screenDiv.style.userSelect = ""
}

window.addEventListener("resize", () => {
    if (!active) { return }
    const { cols, rows } = getSize()
    if (cells.length) { resizeCells(cols, rows) }
    resizeHandler?.(cols, rows)
})

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

function setCell(x : number, y : number, ch : string, style : Style) {
    x = Math.floor(x)
    y = Math.floor(y)
    const row = cells[y]
    if (!row || x < 0 || x >= row.length) { return }
    row[x] = { ch: ch || " ", fg: style.fg ?? "", bg: style.bg ?? "" }
    dirty = true
}

function escape(s : string) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
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

export function isScreenOpen() {
    return active
}

export function feedKey(key : string, ctrl : boolean) {
    if (pendingRead) {
        const resolve = pendingRead
        pendingRead = null
        resolve({ key, ctrl })
    } else if (keyHandler) {
        keyHandler(key, ctrl)
    } else {
        queue.push({ key, ctrl })
    }
}

export function feedPaste(pasted : string) {
    for (const ch of pasted) { feedKey(ch, false) }
}

export function openScreen() {
    active = true
    keyHandler = null
    keyUpHandler = null
    resizeHandler = null
    pendingRead = null
    queue.length = 0
    held.clear()
    resetMouse()
    cells = []
    header.style.display = "none"
    footer.style.display = "none"
    content.textContent = ""
    document.body.append(screenDiv)

    return {
        render(text : string) {
            content.textContent = text
        },
        setHeader(text : string) {
            header.textContent = text
            header.style.display = text ? "" : "none"
            if (cells.length) { const { cols, rows } = getSize(); resizeCells(cols, rows) }
        },
        setFooter(text : string) {
            footer.textContent = text
            footer.style.display = text ? "" : "none"
            if (cells.length) { const { cols, rows } = getSize(); resizeCells(cols, rows) }
        },
        onKey(cb : (key : string, ctrl : boolean) => void) {
            keyHandler = cb
        },
        onKeyUp(cb : (key : string) => void) {
            keyUpHandler = cb
        },
        isDown(key : string) {
            return held.has(normKey(key))
        },
        // type is "down" | "up" | "move" | "wheel", delta is -1/1 for wheel
        onMouse(cb : (e : MouseInfo) => void) {
            mouseHandler = cb
            screenDiv.style.userSelect = "none"
        },
        mouse() {
            return { x: mouse.x, y: mouse.y, down: mouse.buttons.has(0) }
        },
        isMouseDown(button : number = 0) {
            return mouse.buttons.has(button)
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
        close() {
            stopLoop()
            active = false
            keyHandler = null
            keyUpHandler = null
            resizeHandler = null
            pendingRead = null
            queue.length = 0
            held.clear()
            resetMouse()
            cells = []
            screenDiv.remove()
        }
    }
}
