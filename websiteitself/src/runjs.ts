import { copyExecutable, deleteFile, dirExists, dumpFs, getCwd, getUsedBytes, isExecutable, listFiles, makeDir, onFsChange, readFile, removeDir, resolvePath, setExecutable, writeFile } from "./kernel/filesystem";
import { getEnv, listEnv, setEnv, unsetEnv } from "./kernel/env";
import { canWrite, getUser, getUsers } from "./kernel/users";
import { input, printf } from "./terminal";
import { openScreen, type ScreenOptions } from "./screen";
import { findInPath, interpretCmd } from "./commands";
import { isMobile } from "./helpers";
import restart from "./kernel/power/restart";

class ExitSignal {
    code : number
    constructor(code : number) { this.code = code }
}

let audio : AudioContext | null = null

function beep(freq : number = 440, ms : number = 100) {
    audio ??= new AudioContext()
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = "square"
    osc.frequency.value = freq
    gain.gain.value = 0.05
    osc.connect(gain).connect(audio.destination)
    osc.start()
    osc.stop(audio.currentTime + ms / 1000)
}

// localStorage is ~5MB in most browsers
const DISK_TOTAL = 5 * 1024 * 1024

function needWrite(path : string) {
    if (!canWrite(path)) { throw new Error(resolvePath(path) + ": permission denied") }
}

function needFile(path : string) {
    const data = readFile(path)
    if (data == null) { throw new Error(resolvePath(path) + ": no such file") }
    return data
}

function copy(from : string, to : string) {
    const data = needFile(from)
    needWrite(to)
    writeFile(to, data)
    copyExecutable(from, to)
}

// calls cb(path, data) when the file, or anything inside the dir, changes. data is null when deleted
function watch(path : string, cb : (path : string, data : string | null) => void) {
    const target = resolvePath(path)
    const prefix = target == "/" ? "/" : target + "/"
    return onFsChange((p, data) => {
        if (p == target || p.startsWith(prefix)) { cb(p, data) }
    })
}

// runs a js app with its screen() opening as a window instead of fullscreen
async function launch(name : string, win : ScreenOptions = {}, args : string[] = []) {
    const path = name.includes("/") ? resolvePath(name) : findInPath(name)
    const code = path == null ? null : readFile(path)
    if (path == null || code == null) { throw new Error(name + ": command not found") }
    if (!isExecutable(path)) { throw new Error(name + ": permission denied (try chmod +x)") }
    if (!path.endsWith(".js") && !code.startsWith("#!js")) { throw new Error(name + ": only js apps can be launched in a window") }
    const defaults = { x: 2, y: 1, w: 60, h: 20, title: path.split("/").pop(), ...win }
    return runJsFile(code, args, path, defaults)
}

// per app storage, lives in ~/.local/share/<app>/ like a real linux app would
function appStorage(app : string) {
    const dir = () => "/home/" + getUser() + "/.local/share/" + app + "/"
    return {
        get(key : string) {
            const raw = readFile(dir() + key)
            return raw == null ? null : JSON.parse(raw)
        },
        set(key : string, value : any) {
            writeFile(dir() + key, JSON.stringify(value))
        },
        remove(key : string) {
            deleteFile(dir() + key)
        },
    }
}

export async function runJsFile(code : string, args : string[] = [], path : string = "script", windowDefaults? : ScreenOptions) {
    if (code.startsWith("#!")) {
        const nl = code.indexOf("\n")
        const firstLine = nl == -1 ? code : code.slice(0, nl)
        const rest = nl == -1 ? "" : code.slice(nl + 1)
        const inline = firstLine.replace(/^#!\S*\s?/, "")
        code = inline && rest ? inline + "\n" + rest : inline + rest
    }

    const app = (path.split("/").pop() || "script").replace(/\.js$/, "")

    const api = {
        print: (s : any) => printf(String(s)),
        printf: (s : any, color? : string) => printf(String(s), color),
        readFile,
        writeFile: (p : string, data : string) => { needWrite(p); writeFile(p, data) },
        deleteFile: (p : string) => { needWrite(p); deleteFile(p) },
        listFiles,
        exists: (p : string) => readFile(p) != null || dirExists(p),
        isDir: (p : string) => readFile(p) == null && dirExists(p),
        stat: (p : string) => {
            const data = readFile(p)
            if (data != null) { return { type: "file", size: data.length, executable: isExecutable(p) } }
            return dirExists(p) ? { type: "dir", size: 0, executable: false } : null
        },
        mkdir: (p : string) => { needWrite(p); makeDir(p) },
        rmdir: (p : string) => {
            if (resolvePath(p) == "/") { throw new Error("rmdir: refusing to remove /") }
            needWrite(p)
            removeDir(p)
        },
        copy,
        move: (from : string, to : string) => {
            needWrite(from)
            if (resolvePath(from) == resolvePath(to)) { needFile(from); return }
            copy(from, to)
            deleteFile(from)
        },
        chmod: (p : string, exec : boolean) => { needWrite(p); needFile(p); setExecutable(p, exec) },
        watch,
        whoami: getUser,
        env: getEnv,
        setEnv,
        unsetEnv,
        listEnv,
        hostname: () => readFile("/etc/hostname") || "typeos",
        users: getUsers,
        uptime: () => Math.floor(performance.now() / 1000),
        disk: () => ({ used: getUsedBytes(), total: DISK_TOTAL, files: Object.keys(dumpFs()).length }),
        isMobile,
        cwd: getCwd,
        resolvePath,
        sleep: (ms : number) => new Promise(r => setTimeout(r, ms)),
        now: () => performance.now(),
        random: (min : number = 0, max : number = 1) => min + Math.random() * (max - min),
        randInt: (min : number, max : number) => min + Math.floor(Math.random() * (max - min + 1)),
        beep,
        input: (prompt : string = "", mask : boolean = false) => input(prompt, mask),
        run: (line : string) => {
            const parts = line.trim().split(/\s+/)
            const cmd = parts.shift() ?? ""
            return cmd == "" ? Promise.resolve() : interpretCmd(cmd, parts)
        },
        storage: appStorage(app),
        exit: (code : number = 0) => { throw new ExitSignal(code) },
        screen: (opts : ScreenOptions = {}) => openScreen(windowDefaults ? { ...windowDefaults, ...opts } : opts),
        launch,
        args,
        restart: () => {
            if (getUser() != "root") { throw new Error("restart: permission denied (try sudo)") }
            restart()
        },
    }

    try {
        const fn = new Function(...Object.keys(api), "return (async () => {\n" + code + "\n})()")
        await fn(...Object.values(api))
        return 0
    } catch (e) {
        if (e instanceof ExitSignal) { return e.code }
        printf("js: " + (e instanceof Error ? e.message : String(e)), "red")
        return 1
    }
}
