import { interpretCmd } from "./commands";
import { getCwd, readFile } from "./kernel/filesystem";
import globals from "./kernel/globals";
import panic from "./kernel/panic";
import unsuspend from "./kernel/power/unsuspend";
import { getUser } from "./kernel/users";
import { isNanoOpen, nanoInput, nanoPaste } from "./nano";
import { feedKey, feedPaste, isScreenOpen } from "./screen";

function getTerminalDiv() {
    return document.getElementById("terminal")
}
const everythingInTerminal: number[] = []

function getInputTxt() {
    return document.getElementById("input")
}

let text = ""

export let canType = true

let pendingInput : ((line : string) => void) | null = null
let inputPrompt = ""
let maskInput = false

const history : string[] = []
let histIndex = 0

export function getHistory() {
    return history
}

export function input(promptText : string, mask : boolean = false) : Promise<string> {
    return new Promise((resolve) => {
        pendingInput = resolve
        inputPrompt = promptText
        maskInput = mask
        text = ""
        updateTxt()
    })
}

const cursor = document.createElement("span")
cursor.className = "cursor"

function addNext(everythingInTerminal: number[]): number {
  const next = (everythingInTerminal.at(-1) ?? 0) + 1;
  everythingInTerminal.push(next);
  return next;
}

export function printf(text : string, color : string = "white", exceptToFont : boolean = false) {
    const newp = document.createElement("p")
    newp.textContent = text
    if (color != "white") { newp.style.color = color; }
    if (exceptToFont) { newp.style.fontFamily = '"Ubuntu Mono", "Menlo", "Consolas", monospace;'} // a font change cmd will MAYBE just MAYBE implemented. this is just so the TypeOS logo doesn't get absolutely vandalised by another font
    if (!document.getElementById("terminal")) { panic("terminalDiv has been deleted. very funny")}
    getTerminalDiv()?.append(newp)
    scrollToBottom()

    const added= addNext(everythingInTerminal)
    return added
}

function scrollToBottom() {
    window.scrollTo(0, document.body.scrollHeight)
}

export function clearTerminal() {
    everythingInTerminal.length = 0;
    const terminalDiv = getTerminalDiv()
    if (terminalDiv) { terminalDiv.innerHTML = ""; }
}

export function changeColor(color : string) {
    const terminalDiv = getTerminalDiv()
    if (terminalDiv) { terminalDiv.style.color = color }
}

export function registerInput(input : string, ctrl : boolean = false) {
    if (isNanoOpen()) {
        nanoInput(input, ctrl)
        return
    }

    if (globals.suspended == true) {
        unsuspend()
    }
    if (isScreenOpen()) {
        feedKey(input, ctrl)
        return
    }
    if (canType == false) { return }
    if (input.length != 1) {
        if (input == "Backspace") {
            text = text.slice(0,-1)
            updateTxt()
        } else if (input == "Enter") {
            const line = text
            text = ""

            if (pendingInput) {
                printf(inputPrompt + (maskInput ? "*".repeat(line.length) : line))
                const resolve = pendingInput
                pendingInput = null
                inputPrompt = ""
                maskInput = false
                resolve(line)
                updateTxt()
                return
            }

            printf(prompt() + line)
            if (line.trim() != "") {
                history.push(line)
            }
            histIndex = history.length

            const parts = line.trim().split(/\s+/)
            const cmd = parts.shift() ?? ""
            if (cmd != "") {
                interpretCmd(cmd, parts)
            }
            updateTxt()
        } else if (input == "ArrowUp") {
            if (pendingInput || history.length == 0) { return }
            if (histIndex > 0) { histIndex-- }
            text = history[histIndex]
            updateTxt()
        } else if (input == "ArrowDown") {
            if (pendingInput || history.length == 0) { return }
            if (histIndex < history.length) { histIndex++ }
            text = histIndex == history.length ? "" : history[histIndex]
            updateTxt()
        }
        return
    } 

    text += input;
    updateTxt()
}

export function registerPaste(pasted : string) {
    if (isNanoOpen()) {
        nanoPaste(pasted)
        return
    }
    if (isScreenOpen()) {
        feedPaste(pasted)
        return
    }
    if (canType == false) { return }
    text += pasted.replace(/\n/g, " ")
    updateTxt()
}

function prompt() {
    const sigil = getUser() == "root" ? " # " : " $ "
    return getUser() + "@" + (readFile("/etc/hostname") || "typeos") + ":" + getCwd() + sigil
}

function updateTxt() {
    const inputtxt = getInputTxt()
    if (inputtxt) {
        const shown = maskInput ? "*".repeat(text.length) : text
        inputtxt.textContent = (pendingInput ? inputPrompt : prompt()) + shown
        inputtxt.append(cursor)
        scrollToBottom()
    }
}

updateTxt()

export function disableType() {
    canType = false
    const inputtxt = getInputTxt()
    if (inputtxt) { inputtxt.textContent = "" }
}

export function enableType() {
    canType = true
    updateTxt()
}