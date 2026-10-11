import { runScript } from "./commands";
import { isExecutable, normalize, readFile, writeFile } from "./kernel/filesystem";
import { runJsFile } from "./runjs";

export default function startAutoStarting() {
    console.log("starting autostart")
    if (!readFile("/etc/systemd/system/autostart")) { writeFile("/etc/systemd/system/autostart", ""); console.log("file isnt valid"); return; } // returning cuz well if its empty then empty
    const autoStart = readFile("/etc/systemd/system/autostart") || ""
    const eachPath = autoStart.split("\n")

    for (const rawPath of eachPath) {
        const path = rawPath.trim()
        if (path == "") continue
        console.log(path)
        const content = readFile(path)
        const isValid = isExecutable(path) && content != null
        if (isValid) {
            console.log(path + " is valid")
            if (normalize(path).endsWith(".js") || content.startsWith("#!js")) { runJsFile(content, [], normalize(path)); console.log("ran js " + path)}
            else { runScript(content); console.log("ran script " + path) }
        }
    }
}