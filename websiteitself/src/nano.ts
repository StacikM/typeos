import { readFile, writeFile } from "./kernel/filesystem";
import { printf } from "./terminal";

let open = false
let path = ""
let buffer = ""
let pos = 0

const editorDiv = document.createElement("div")
editorDiv.id = "editor"

const header = document.createElement("p")
header.className = "bar"

const body = document.createElement("pre")

const footer = document.createElement("p")
footer.className = "bar"
footer.textContent = "Ctrl+X: save & exit    Esc: exit without saving"

editorDiv.append(header, body, footer)

const cursor = document.createElement("span")
cursor.className = "cursor"

export function isNanoOpen() {
    return open
}

export function openNano(p : string) {
    path = p
    buffer = readFile(p) ?? ""
    pos = buffer.length
    open = true
    render()
    document.body.append(editorDiv)
}

function insert(s : string) {
    buffer = buffer.slice(0, pos) + s + buffer.slice(pos)
    pos += s.length
}

function lineStart(p : number) {
    if (p <= 0) { return 0 }
    return buffer.lastIndexOf("\n", p - 1) + 1
}

function lineEnd(p : number) {
    const end = buffer.indexOf("\n", p)
    return end == -1 ? buffer.length : end
}

function moveUp() {
    const start = lineStart(pos)
    if (start == 0) { return }
    const col = pos - start
    const prevStart = lineStart(start - 1)
    pos = Math.min(prevStart + col, start - 1)
}

function moveDown() {
    const col = pos - lineStart(pos)
    const end = lineEnd(pos)
    if (end == buffer.length) { return }
    const nextStart = end + 1
    pos = Math.min(nextStart + col, lineEnd(nextStart))
}

export function nanoInput(key : string, ctrl : boolean) {
    if (ctrl) {
        if (key.toLowerCase() == "x") {
            writeFile(path, buffer)
            close()
            printf("nano: saved " + path)
        }
        return
    }

    if (key == "Escape") {
        close()
        return
    }

    if (key == "ArrowLeft") {
        pos = Math.max(0, pos - 1)
    } else if (key == "ArrowRight") {
        pos = Math.min(buffer.length, pos + 1)
    } else if (key == "ArrowUp") {
        moveUp()
    } else if (key == "ArrowDown") {
        moveDown()
    } else if (key == "Home") {
        pos = lineStart(pos)
    } else if (key == "End") {
        pos = lineEnd(pos)
    } else if (key == "Backspace") {
        if (pos == 0) { return }
        buffer = buffer.slice(0, pos - 1) + buffer.slice(pos)
        pos--
    } else if (key == "Delete") {
        buffer = buffer.slice(0, pos) + buffer.slice(pos + 1)
    } else if (key == "Enter") {
        insert("\n")
    } else if (key.length == 1) {
        insert(key)
    } else {
        return
    }
    render()
}

export function nanoPaste(pasted : string) {
    insert(pasted)
    render()
}

function render() {
    header.textContent = "nano — " + path
    body.textContent = ""
    body.append(buffer.slice(0, pos), cursor, buffer.slice(pos))
    cursor.scrollIntoView({ block: "nearest" })
}

function close() {
    open = false
    editorDiv.remove()
}
