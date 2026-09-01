import { deleteFile, listFiles, readFile, writeFile } from "./kernel/filesystem";
import { getEnv } from "./kernel/env";
import { getUser } from "./kernel/users";
import { printf } from "./terminal";
import { openScreen } from "./screen";
import restart from "./kernel/power/restart";

export async function runJsFile(code : string, args : string[] = []) {
    if (code.startsWith("#!")) {
        const nl = code.indexOf("\n")
        const firstLine = nl == -1 ? code : code.slice(0, nl)
        const rest = nl == -1 ? "" : code.slice(nl + 1)
        const inline = firstLine.replace(/^#!\S*\s?/, "")
        code = inline && rest ? inline + "\n" + rest : inline + rest
    }

    const api = {
        print: (s : any) => printf(String(s)),
        printf: (s : any, color? : string) => printf(String(s), color),
        readFile,
        writeFile,
        deleteFile,
        listFiles,
        whoami: getUser,
        env: getEnv,
        sleep: (ms : number) => new Promise(r => setTimeout(r, ms)),
        screen: openScreen,
        args,
        restart,
    }

    try {
        const fn = new Function(...Object.keys(api), "return (async () => {\n" + code + "\n})()")
        await fn(...Object.values(api))
    } catch (e) {
        printf("js: " + (e instanceof Error ? e.message : String(e)), "red")
    }
}
