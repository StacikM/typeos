import { disableType } from "../../terminal";
import globals from "../globals";

export default function suspend() {
    const terminalDiv = document.getElementById("terminal")
    const input = document.getElementById("input")
    if (!terminalDiv || !input) { return; }
    globals.suspended = true
    disableType()
    terminalDiv.style.display = "none"
    input.style.display = "none"
    const newthingy = document.createElement("p")
    newthingy.textContent = "press any key to wake up"
    newthingy.id = "suspendtxt"
    document.body.append(newthingy)
}