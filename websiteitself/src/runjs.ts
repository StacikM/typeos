import { deleteFile, listFiles, readFile, writeFile } from "./kernel/filesystem";
import { getEnv } from "./kernel/env";
import { getUser } from "./kernel/users";
import { printf } from "./terminal";

export async function runJsFile(code : string) {
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
    }

    try {
        const fn = new Function(...Object.keys(api), "return (async () => {\n" + code + "\n})()")
        await fn(...Object.values(api))
    } catch (e) {
        printf("js: " + (e instanceof Error ? e.message : String(e)), "red")
    }
}
