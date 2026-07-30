import { dumpFs, onFsChange, writeFile } from "./kernel/filesystem";

const HELPER_URL = "http://localhost:8973";

let key : string | null = null;
let attached = false;
let pollTimer : ReturnType<typeof setInterval> | null = null;
let applyingRemote = false;
let known : Record<string, string> = {};

export async function isAvailable() {
    try {
        const res = await fetch(HELPER_URL + "/status");
        const text = await res.text();
        return text === "ok";
    } catch {
        return false;
    }
}

export function isAttached() {
    return attached;
}

export async function attach(newKey : string) {
    const res = await fetch(HELPER_URL + "/attach", { method: "POST", headers: { "X-Key": newKey } });
    if (!res.ok) { return false; }
    key = newKey;
    attached = true;
    known = {};
    await pushAll();
    pollTimer = setInterval(pull, 5000);
    return true;
}

export async function detach() {
    if (key) {
        await fetch(HELPER_URL + "/detach", { method: "POST", headers: { "X-Key": key } });
    }
    attached = false;
    key = null;
    if (pollTimer != null) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
}

onFsChange((path, data) => {
    if (!attached || applyingRemote) { return }
    push(path, data);
});

async function push(path : string, data : string | null) {
    if (!key || path.endsWith("/")) { return }
    const relPath = path.slice(1);
    if (relPath == "") { return }

    if (data == null) {
        await fetch(HELPER_URL + "/files?path=" + encodeURIComponent(relPath), { method: "DELETE", headers: { "X-Key": key } });
    } else {
        await fetch(HELPER_URL + "/files/write", {
            method: "POST",
            headers: { "X-Key": key, "Content-Type": "application/json" },
            body: JSON.stringify({ path: relPath, content: data })
        });
    }
}

async function pushAll() {
    const fs = dumpFs();
    for (const [path, data] of Object.entries(fs)) {
        if (path.endsWith("/")) { continue }
        await push(path, data);
    }
}

async function pull() {
    if (!key) { return }
    const res = await fetch(HELPER_URL + "/files", { headers: { "X-Key": key } });
    if (!res.ok) { return }
    const files : { path : string, modified : string }[] = await res.json();

    for (const file of files) {
        if (known[file.path] == file.modified) { continue }
        known[file.path] = file.modified;

        const contentRes = await fetch(HELPER_URL + "/files/content?path=" + encodeURIComponent(file.path), { headers: { "X-Key": key } });
        if (!contentRes.ok) { continue }
        const content = await contentRes.text();

        applyingRemote = true;
        writeFile("/" + file.path, content);
        applyingRemote = false;
    }
}
