let active = false
let keyHandler : ((key : string, ctrl : boolean) => void) | null = null
let pendingRead : ((k : { key : string, ctrl : boolean }) => void) | null = null
const queue : { key : string, ctrl : boolean }[] = []

const screenDiv = document.createElement("div")
screenDiv.id = "screen"

const header = document.createElement("p")
header.className = "bar"

const body = document.createElement("pre")

const footer = document.createElement("p")
footer.className = "bar"

screenDiv.append(header, body, footer)

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
    pendingRead = null
    queue.length = 0
    header.style.display = "none"
    footer.style.display = "none"
    body.textContent = ""
    document.body.append(screenDiv)

    return {
        render(text : string) {
            body.textContent = text
        },
        setHeader(text : string) {
            header.textContent = text
            header.style.display = text ? "" : "none"
        },
        setFooter(text : string) {
            footer.textContent = text
            footer.style.display = text ? "" : "none"
        },
        onKey(cb : (key : string, ctrl : boolean) => void) {
            keyHandler = cb
        },
        readKey() : Promise<{ key : string, ctrl : boolean }> {
            return new Promise((resolve) => {
                const next = queue.shift()
                if (next) { resolve(next) } else { pendingRead = resolve }
            })
        },
        close() {
            active = false
            keyHandler = null
            pendingRead = null
            queue.length = 0
            screenDiv.remove()
        }
    }
}
