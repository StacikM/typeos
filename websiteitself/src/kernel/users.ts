import { printf } from "../terminal";
import { changeDir, makeDir, readFile, resolvePath, writeFile } from "./filesystem";

let currentUser = "root"

export function getUser() {
    return currentUser
}

export function getUsers() {
    const data = readFile("/etc/passwd")
    return data == null ? ["root"] : data.split("\n")
}

export function userExists(name : string) {
    return getUsers().includes(name)
}

export function addUser(name : string) {
    if (userExists(name)) { return false }
    writeFile("/etc/passwd", getUsers().concat(name).join("\n"))
    makeDir("/home/" + name)
    return true
}

export function switchUser(name : string) {
    if (!userExists(name)) { return false }
    currentUser = name
    const success = changeDir("/home/" + name)
    if (!success) { printf("warning: you have deleted the home dir of this user or we have a broken kernel, so you will stay in your current dir", "orange")}
    return true
}

export function canWrite(path : string) {
    if (currentUser == "root") { return true }
    const resolved = resolvePath(path)
    const home = "/home/" + currentUser
    return resolved == home || resolved.startsWith(home + "/")
}

export async function runAsRoot(fn : () => Promise<void> | void) {
    const prev = currentUser
    currentUser = "root"
    try {
        await fn()
    } finally {
        currentUser = prev
    }
}
