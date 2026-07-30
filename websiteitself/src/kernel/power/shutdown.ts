import { clearTerminal, disableType, printf } from "../../terminal";
const powerbtn = document.getElementById("powerbtn")

export default function shutdown() {
    clearTerminal();
    printf("The system has been shutdown. Press CTRL + R to restart")
    disableType();
    document.getElementById("input")?.remove();
    if (powerbtn) { powerbtn.style.display = "flex" }
}