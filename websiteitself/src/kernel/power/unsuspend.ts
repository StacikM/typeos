import { enableType } from "../../terminal";
import globals from "../globals";

export default function unsuspend() {
    const terminalDiv = document.getElementById("terminal")
    const input = document.getElementById("input")
    if (!terminalDiv || !input) { return; }
    globals.suspended = false
    enableType()
    terminalDiv.style.display = "block"
    input.style.display = "block"
    document.getElementById("suspendtxt")?.remove()
}