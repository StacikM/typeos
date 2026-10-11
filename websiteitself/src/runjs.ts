import { deleteFile, getCwd, listFiles, readFile, resolvePath, writeFile } from "./kernel/filesystem";
import { getEnv } from "./kernel/env";
import { canWrite, getUser } from "./kernel/users";
import { input, printf } from "./terminal";
import { openScreen } from "./screen";
import { interpretCmd } from "./commands";
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

function needWrite(path : string) {
    if (!canWrite(path)) { throw new Error(resolvePath(path) + ": permission denied") }
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

export async function runJsFile(code : string, args : string[] = [], path : string = "script") {
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
        whoami: getUser,
        env: getEnv,
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
        screen: openScreen,
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
