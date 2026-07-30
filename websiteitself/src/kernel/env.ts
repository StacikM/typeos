import { readFile } from "./filesystem";
import { getUser } from "./users";

const vars : Record<string, string> = { PATH: "/bin" }

export function getEnv(name : string) : string | null {
    if (name in vars) { return vars[name] }
    if (name == "USER") { return getUser() }
    if (name == "HOME") { return "/home/" + getUser() }
    if (name == "HOSTNAME") { return readFile("/etc/hostname") || "typeos" }
    return null
}

export function setEnv(name : string, value : string) {
    vars[name] = value
}

export function unsetEnv(name : string) {
    delete vars[name]
}

export function listEnv() {
    const names = new Set(["USER", "HOME", "HOSTNAME", ...Object.keys(vars)])
    return [...names].map(n => n + "=" + getEnv(n))
}

export function expandEnv(str : string) {
    return str.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, name) => getEnv(name) ?? "")
}
