let cwd = "/"

export function getCwd() {
    return cwd
}

export function changeDir(path : string) {
    if (!dirExists(path)) {
        return false
    }
    cwd = normalize(path)
    return true
}

export function dirExists(path : string) {
    const dir = normalize(path)
    if (dir == "/") { return true }
    if (localStorage.getItem(dir + "/") != null) { return true }
    return listFiles(dir).length > 0
}

export function makeDir(path : string) {
    localStorage.setItem(normalize(path) + "/", "")
}

export function removeDir(path : string) {
    const dir = normalize(path)
    const prefix = dir == "/" ? "/" : dir + "/"

    const doomed : string[] = []
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith(prefix)) { doomed.push(key) }
    }
    for (const key of doomed) { localStorage.removeItem(key) }

    if (cwd == dir || cwd.startsWith(prefix)) {
        cwd = "/"
    }
}

export function resolvePath(path : string) {
    return normalize(path)
}

export function dumpFs() {
    const fs : Record<string, string> = {}
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key != null) { fs[key] = localStorage.getItem(key) ?? "" }
    }
    return fs
}

export function loadFs(fs : Record<string, string>) {
    localStorage.clear()
    for (const [key, value] of Object.entries(fs)) {
        localStorage.setItem(key, value)
    }
    cwd = "/"
}

function normalize(path : string) {
    if (!path.startsWith("/")) { path = cwd + "/" + path }

    const parts : string[] = []
    for (const part of path.split("/")) {
        if (part == "" || part == ".") { continue }
        if (part == "..") {
            parts.pop()
        } else {
            parts.push(part)
        }
    }
    return "/" + parts.join("/")
}

export function writeFile(path : string, data : string) {
    localStorage.setItem(normalize(path), data)
}

export function readFile(path : string) {
    return localStorage.getItem(normalize(path))
}

export function deleteFile(path : string) {
    localStorage.removeItem(normalize(path))
}

export function listFiles(path : string) {
    let dir = normalize(path)
    if (!dir.endsWith("/")) { dir += "/" }

    const names = new Set<string>()
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith(dir)) {
            const rest = key.slice(dir.length)
            if (rest == "") { continue }
            const slash = rest.indexOf("/")
            names.add(slash == -1 ? rest : rest.slice(0, slash + 1))
        }
    }
    return [...names].sort()
}
