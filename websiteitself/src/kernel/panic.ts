import { clearTerminal, disableType, printf } from "../terminal"

declare global {
    interface Window {
        panic: typeof panic;
    }
}

export default function panic(msg : string) {
    document.body.style.backgroundColor = "red"
    clearTerminal();
    const terminal = document.createElement("div") // backup
    terminal.id = "terminal"
    if (!document.getElementById("terminal")) {
        document.body.append(terminal)
    }
    printf("KERNEL PANIC - Not Syncing")
    disableType();
    printf("-- i sorry :( --")
    printf("The system has been terminated abruptly. Reason: " + msg)
    printf("You may restart your system using CTRL + R")
    printf("Sorry for the inconvience :(")
    document.getElementById("input")?.remove();
}

window.panic = panic;