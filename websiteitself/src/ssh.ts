import { getKey, HELPER_URL } from "./pchelper";

let connected = false;
let label = "";

export function isSshConnected() {
    return connected;
}

export function sshLabel() {
    return label;
}

export async function sshConnect(host : string, port : number, user : string, password : string) {
    const key = getKey();
    if (!key) { return "not attached to pc helper" }
    try {
        const res = await fetch(HELPER_URL + "/ssh/connect", {
            method: "POST",
            headers: { "X-Key": key, "Content-Type": "application/json" },
            body: JSON.stringify({ host, port, user, password }),
            signal: AbortSignal.timeout(30000)
        });
        if (!res.ok) { return (await res.text()) || "connection failed" }
        connected = true;
        label = user + "@" + host;
        return null;
    } catch (e) {
        return e instanceof DOMException && e.name == "TimeoutError" ? "connection timed out" : "pc helper unreachable"
    }
}

export async function sshRun(command : string) {
    const key = getKey();
    if (!key || !connected) { return { output: "", error: "not connected", cwd: "" } }
    try {
        const res = await fetch(HELPER_URL + "/ssh/run", {
            method: "POST",
            headers: { "X-Key": key, "Content-Type": "application/json" },
            body: JSON.stringify({ command }),
            signal: AbortSignal.timeout(35000)
        });
        if (!res.ok) { return { output: "", error: (await res.text()) || "error", cwd: "" } }
        return await res.json() as { output : string, error : string, cwd : string };
    } catch (e) {
        const msg = e instanceof DOMException && e.name == "TimeoutError" ? "command timed out" : "pc helper unreachable"
        return { output: "", error: msg, cwd: "" }
    }
}

export async function sshDisconnect() {
    const key = getKey();
    if (key) {
        await fetch(HELPER_URL + "/ssh/disconnect", { method: "POST", headers: { "X-Key": key } });
    }
    connected = false;
    label = "";
}
