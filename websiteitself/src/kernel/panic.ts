import { clearTerminal, disableType, printf } from "../terminal"

export default function panic(msg : string) {
    document.body.style.backgroundColor = "red"
    clearTerminal();
    printf("KERNEL PANIC")
    disableType();
    printf("-- i sorry :( --")
    printf("The system has been terminated abruptly. Reason: " + msg)
    printf("You may restart your system using CTRL + R")
    printf("Sorry for the inconvience :(")
    document.getElementById("input")?.remove();
}