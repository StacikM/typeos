import { downloadFile, isMobile, pickFile, youtubeUrlToEmbed } from "./helpers";
import { changeDir, deleteFile, dirExists, dumpFs, getCwd, listFiles, loadFs, makeDir, readFile, removeDir, resolvePath, writeFile } from "./kernel/filesystem";
import { addUser, canWrite, getUser, getUsers, runAsRoot, switchUser } from "./kernel/users";
import { expandEnv, listEnv, setEnv, unsetEnv } from "./kernel/env";
import restart from "./kernel/power/restart";
import shutdown from "./kernel/power/shutdown";
import { openNano } from "./nano";
import { changeColor, clearTerminal, getHistory, printf } from "./terminal";
import panic from "./kernel/panic";

const manPages : Record<string, string> = {
    help: "help — list every command in one line",
    man: "man <command> — show the manual page for a command",
    echo: "echo <text> — print text; $VARS get expanded (try: echo $USER)",
    color: "color <color> — set the terminal text color (any css color: lime, #ff00ff, ...)",
    clear: "clear — wipe all terminal output",
    ls: "ls [path] — list files and directories (directories end with /). defaults to the current dir",
    cd: "cd [path] — change directory. no argument goes to /, .. goes up one",
    pwd: "pwd — print the current directory",
    mkdir: "mkdir <path> — create a new (empty) directory",
    rmdir: "rmdir [-f] <path> — remove a directory. refuses if not empty unless -f. deleting / needs --no-preserve-root",
    cat: "cat <path> — print the contents of a file",
    write: "write <path> <text> — write text to a file (overwrites)",
    touch: "touch <path> — create an empty file if it doesn't exist",
    cp: "cp <original> <copy> — copy a file",
    mv: "mv <from> <to> — move or rename a file",
    rm: "rm [-rf] <path> — delete a file, or a directory with -r. deleting / needs --no-preserve-root",
    nano: "nano <path> — text editor. arrows/home/end move, ctrl+x saves & exits, esc exits without saving",
    sh: "sh <path> — run a script: one command per line, # starts a comment",
    import: "import <path> — upload a real file from your computer into the filesystem (max 1 MB)",
    export: "export <path> — download a file to your computer. export NAME=value sets an env variable",
    env: "env — list all environment variables",
    unset: "unset <NAME> — delete an environment variable",
    backup: "backup — download the whole filesystem as a json disk image",
    restore: "restore — replace the whole filesystem with a backup file (root only, wipes current data!)",
    curl: "curl <url> — fetch a url and print the response body",
    watchyt: "watchyt <url> — embed a youtube video in the terminal",
    whoami: "whoami — print the current user",
    users: "users — list all users",
    useradd: "useradd <name> — create a user with a home dir (root only)",
    su: "su [name] — switch user, defaults to root",
    sudo: "sudo <command> [args] — run one command as root",
    hostnamectl: "hostnamectl set-hostname <name> — rename the machine (shown in the prompt)",
    history: "history — print previously run commands. arrow up/down cycles through them at the prompt",
    neofetch: "neofetch — show off your system",
    reboot: "reboot — restart TypeOS (root only)",
    shutdown: "shutdown — power off (root only)",
    debug: "debug - debug cmds that the devs of TypeOS use to speed up development or test features",
}

function needWrite(path : string) {
    if (canWrite(path)) { return true }
    printf("permission denied (try sudo)")
    return false
}

export async function runScript(script : string) {
    for (const line of script.split("\n")) {
        const trimmed = line.trim()
        if (trimmed == "" || trimmed.startsWith("#")) { continue }
        const parts = trimmed.split(/\s+/)
        const cmd = parts.shift() ?? ""
        await interpretCmd(cmd, parts)
    }
}

export async function interpretCmd(cmd : string, args: Array<string>) {
    cmd = expandEnv(cmd)
    args = args.map(expandEnv)

    if (cmd == "color") {
        if (args.length == 0) {
            printf("usage: color <color>")
            return
        }
        changeColor(args[0])
    } else if (cmd == "clear") {
        clearTerminal()
    } else if (cmd == "echo") {
        printf(args.join(" "))
    } else if (cmd == "help") {
        printf("commands: " + Object.keys(manPages).join(", "))
        printf("type man <command> for details")
    } else if (cmd == "cat") {
        if (args.length == 0) {
            printf("usage: cat <path>")
            return
        }
        const data = readFile(args[0])
        if (data == null) {
            printf("cat: " + args[0] + ": no such file")
        } else {
            printf(data)
        }
    } else if (cmd == "cd") { 
        const target = args[0] ?? "/"
        if (!changeDir(target)) {
            printf("cd: " + target + ": no such directory")
        }
    } else if (cmd == "pwd") {
        printf(getCwd())
    } else if (cmd == "ls") {
        const files = listFiles(args[0] ?? ".")
        printf(files.join("  "))
    } else if (cmd == "rm") {
        const flags = args.filter(a => a.startsWith("-"))
        const noPreserveRoot = flags.includes("--no-preserve-root")
        const recursive = flags.some(f => f != "--no-preserve-root" && f.includes("r"))
        const target = args.filter(a => !a.startsWith("-"))[0]
        if (target == undefined) { printf("usage: rm [-rf] <path>"); return }
        if (!needWrite(target)) { return }

        if (readFile(target) != null) {
            deleteFile(target)
        } else if (dirExists(target)) {
            if (!recursive) {
                printf("rm: cannot remove " + target + ": is a directory (use -r)")
                return
            }
            if (resolvePath(target) == "/" && !noPreserveRoot) {
                printf("rm: it is dangerous to operate recursively on '/' (use --no-preserve-root if you really mean it)")
                return
            }
            removeDir(target)
        } else {
            printf("rm: cannot remove " + target + ": no such file or directory")
        }
    } else if (cmd == "write") {
        if (args.length < 2) {
            printf("usage: write <path> <text>")
            return
        }
        if (!needWrite(args[0])) { return }

        writeFile(args[0], args.slice(1).join(" "))
    } else if (cmd == "mkdir") {
        if (args.length == 0) { printf("usage: mkdir <path>"); return }
        if (!needWrite(args[0])) { return }
        if (dirExists(args[0])) {
            printf("mkdir: " + args[0] + ": already exists")
            return
        }
        makeDir(args[0])
    } else if (cmd == "rmdir") {
        const force = args.includes("-f")
        const noPreserveRoot = args.includes("--no-preserve-root")
        const target = args.filter(a => !a.startsWith("-"))[0]
        if (target == undefined) { printf("usage: rmdir [-f] <path>"); return }
        if (!needWrite(target)) { return }
        if (!dirExists(target)) {
            printf("rmdir: " + target + ": no such directory")
            return
        }
        if (!force && listFiles(target).length > 0) {
            printf("rmdir: " + target + ": directory not empty (use -f to delete anyway)")
            return
        }
        if (resolvePath(target) == "/" && !noPreserveRoot) {
            printf("rmdir: it is dangerous to operate recursively on '/' (use --no-preserve-root if you really mean it)")
            return
        }
        removeDir(target)
    } else if (cmd == "nano") {
        if (args.length == 0) {
            printf("usage: nano <path>")
            return
        }
        if (!needWrite(args[0])) { return }
        openNano(args[0])
    } else if (cmd == "sh") {
        if (args.length == 0) { printf("usage: sh <path>"); return }
        const script = readFile(args[0])
        if (script == null) {
            printf("sh: " + args[0] + ": no such file")
            return
        }
        await runScript(script)
    } else if (cmd == "whoami") {
        printf(getUser())
    } else if (cmd == "users") {
        printf(getUsers().join("\n"))
    } else if (cmd == "useradd") {
        if (args.length == 0) { printf("usage: useradd <name>"); return }
        if (getUser() != "root") { printf("permission denied (try sudo)"); return }
        if (!addUser(args[0])) {
            printf("useradd: user " + args[0] + " already exists")
            return
        }
        printf("created user " + args[0] + " with home /home/" + args[0])
    } else if (cmd == "su") {
        const name = args[0] ?? "root"
        if (!switchUser(name)) {
            printf("su: user " + name + " does not exist")
        }
    } else if (cmd == "sudo") {
        if (args.length == 0) { printf("usage: sudo <command> [args]"); return }
        await runAsRoot(() => interpretCmd(args[0], args.slice(1)))
    } else if (cmd == "shutdown") {
        if (getUser() != "root") { printf("permission denied (try sudo)"); return }
        shutdown();
    } else if (cmd == "reboot") {
        if (getUser() != "root") { printf("permission denied (try sudo)"); return }
        restart();
    } else if (cmd == "import") {
        const MAX_SIZE = 1 * 1024 * 1024; // 1 MB

        if (args.length == 0) { printf("usage: import <path>"); return }
        if (!needWrite(args[0])) { return }
        const file = await pickFile()
        if (file) {
            if (file.size > MAX_SIZE) {
                printf("ERROR! Your file is too large, please do a smaller file")
                return
            }
            const data = await file.text();
            writeFile(args[0], data)
            printf("Successfully wrote to " + args[0])
        }
    } else if (cmd == "export") {
        if (args.length == 0) { printf("usage: export <path> | export NAME=value"); return; }

        if (args[0].includes("=")) {
            const [name, ...rest] = args[0].split("=")
            setEnv(name, rest.join("="))
            return
        }

        const data = readFile(args[0])
        if (data == null) {
            printf("export: " + args[0] + ": no such file")
            return
        }
        downloadFile(data, args[0].replaceAll("/", "-"))
    } else if (cmd == "backup") {
        const date = new Date().toISOString().slice(0, 10)
        downloadFile(JSON.stringify(dumpFs(), null, 2), "typeos-backup-" + date + ".json", "application/json")
        printf("backup downloaded (keep it somewhere safe)")
    } else if (cmd == "restore") {
        if (getUser() != "root") { printf("permission denied (try sudo)"); return }
        const file = await pickFile()
        if (file == null) { return }
        try {
            const fs = JSON.parse(await file.text())
            if (typeof fs != "object" || fs == null || Array.isArray(fs)) { throw new Error() }
            for (const value of Object.values(fs)) {
                if (typeof value != "string") { throw new Error() }
            }
            loadFs(fs)
            printf("restored " + Object.keys(fs).length + " files, rebooting...")
            setTimeout(restart, 1000)
        } catch {
            printf("restore: that is not a valid TypeOS backup")
        }
    } else if (cmd == "env") {
        printf(listEnv().join("\n"))
    } else if (cmd == "unset") {
        if (args.length == 0) { printf("usage: unset <NAME>"); return }
        unsetEnv(args[0])
    } else if (cmd == "curl") {
        if (args.length == 0) { printf("usage curl <url>"); return;}
        const res = await fetch(args[0])
        printf(await res.text())

    } else if (cmd == "watchyt") {
        const yturl = args[0]
        if (args.length == 0) { printf("usage: watchyt <url>"); return; }
        if (!yturl.includes("youtube")) { printf("youtube pls"); return; }
        const iframe = document.createElement("iframe")
        iframe.width = "560"
        iframe.height = "315"
        const embedurl = youtubeUrlToEmbed(yturl)
        if (!embedurl) { printf("error, couldn't convert to embed"); return; }
        iframe.src = embedurl + "?autoplay=1" // autoplay is allowed, since we assume that the user typed the cmd and didnt somehow use a function to trigger this
        iframe.title = "yt player"
        iframe.allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
        iframe.referrerPolicy="strict-origin-when-cross-origin"
        iframe.allowFullscreen
        printf("created yt");
        document.getElementById("terminal")?.append(iframe)
        
    } else if (cmd == "hostnamectl") {
        const arg1 = args[0]
        const arg2 = args[1]
        if (!arg1) {
            printf("Static hostname: " + readFile("/etc/hostname") || "Unknown")
            printf("Icon name: " +  (isMobile() ? "Phone" : "Computer/Laptop"))
            printf("Machine ID: " + (readFile("/etc/machine-id") || "Missing (somehow, regenerate with hostnamectl regenMachineId"))
            printf("Boot ID: " + readFile("/etc/boot-id") || "Missing (somehow)")
            printf("Operating System: TypeOS")
            printf("Kernel: TypeOS v1")
            return;
        }
        
        if (arg1 == "set-hostname") { //what a coincidence
            if (!arg2) {
                printf("usage: hostnamectl set-hostname <NAMEEEE>")
                return;
            }
            
            writeFile("/etc/hostname", arg2)
            printf("success")
        } else if (arg1 == "--static") {
            printf(readFile("/etc/hostname") || "Unknown")
        }
    } else if (cmd == "cp") {
        if (!args[0] || !args[1]) { printf("usage: cp <original> <copy>"); return; }
        if (!needWrite(args[1])) { return }
        const a = readFile(args[0])
        if (a == null) { printf("Invalid file"); return;}
        writeFile(args[1], a)
    } else if (cmd == "mv") {
        if (!args[0] || !args[1]) { printf("usage: mv <from> <to>"); return; }
        if (!needWrite(args[0]) || !needWrite(args[1])) { return }
        const a = readFile(args[0])
        if (a == null) { printf("Invalid file"); return; }
        writeFile(args[1], a)
        deleteFile(args[0])
    } else if (cmd == "touch") {
        if (args.length == 0) { printf("usage: touch <path>"); return }
        if (!needWrite(args[0])) { return }
        if (readFile(args[0]) == null) { writeFile(args[0], "") }
    } else if (cmd == "man") {
        if (args.length == 0) { printf("usage: man <command>"); return }
        const page = manPages[args[0]]
        if (page == undefined) {
            printf("no manual entry for " + args[0])
            return
        }
        printf(page)
    } else if (cmd == "history") {
        printf(getHistory().map((line, i) => (i + 1) + "  " + line).join("\n"))
    } else if (cmd == "neofetch") {
        const fs = dumpFs()
        const disk = JSON.stringify(fs).length
        const up = Math.floor(performance.now() / 1000)
        const title = getUser() + "@" + (readFile("/etc/hostname") || "typeos")
        printf(title)
        printf("-".repeat(title.length))
        printf("OS: TypeOS")
        printf("Kernel: TypeOS v1")
        printf("Shell: typesh")
        printf("Uptime: " + Math.floor(up / 60) + "m " + (up % 60) + "s")
        printf("Users: " + getUsers().length)
        printf("Files: " + Object.keys(fs).length)
        printf("Disk: " + (disk / 1024).toFixed(1) + " KB / 5120 KB")
    } else if (cmd == "debug") {
        if (!args[0]) { printf("usage: debug <dbg: panic>"); return; }
        if (args[0] == "panic") { panic("triggered using debug"); }
    } else {
        printf(cmd + ": command not found")
    }
}
