import "./style.css";
import { readFile, writeFile } from "./kernel/filesystem";
import { input, printf, registerInput, registerPaste } from "./terminal";
import restart from "./kernel/power/restart";
import { randomString } from "./helpers";
import { isAvailable } from "./pchelper";

const banner = [
  " _____ __   __ ____   _____   ___   ____  ",
  "|_   _|\\ \\ / /|  _ \\ | ____| / _ \\ / ___| ",
  "  | |   \\ V / | |_) ||  _|  | | | |\\___ \\ ",
  "  | |    | |  |  __/ | |___ | |_| | ___) |",
  "  |_|    |_|  |_|    |_____| \\___/ |____/ ",
].join("\n")

const powerbtn = document.getElementById("powerbtn")

async function start() {
  if (powerbtn) { powerbtn.style.display = "none"}
  navigator.storage?.persist?.()
  printf(banner)
  printf("Welcome to TypeOS")
  printf("This is a crappy recreation of a linux shell in typesh- typescript.")
  writeFile("/etc/boot-id", randomString())
  if (readFile("/home/root/helloworld.txt") == null) {
    writeFile("/home/root/helloworld.txt", "hello! this is an filesystem, using localstorage, crazy right?")
  }
  if (readFile("/etc/setupDone") == null) {
    setup()
  }
  if (readFile("/etc/setupDone")) {
    printf(" ") // acts as a <br> lol
    printf("TypeOS is open source, and has a PC helper so your filesystem exists on your actual PC! use \"downloadPC\" to download PC helper.")
    printf("For github, use \"github\". Thanks!")
    if (await isAvailable()) {
      printf("It seems like you are running TypeOS PC helper, to attach, follow the instructions that the program gave you")
    }
  }
}

async function setup() {
  printf("\nIt looks like you never used TypeOS before, or your data was cleared (either using the reset command or localstorage being cleared)")
  printf("We are gonna ask you some questions.")
  const hostname = await input("What do you want your hostname to be? (Anything)")
  writeFile("/etc/hostname", hostname)
  printf("TypeOS setup is now done (yes that was it)")
  writeFile("/etc/setupDone", "magically")
  writeFile("/etc/machine-id", randomString())
  printf("TypeOS will now restart to apply changes");
  setTimeout(() => {
    restart()
  }, 500);
}

document.addEventListener("keydown", (e) => {
  if (e.metaKey) { return }
  if (e.ctrlKey && (e.key.toLowerCase() == "s" || e.key.toLowerCase() == "x")) {
    e.preventDefault()
  }
  if (e.key.startsWith("Arrow")) {
    e.preventDefault()
  }
  registerInput(e.key, e.ctrlKey)
})

document.addEventListener("paste", (e) => {
  const pasted = e.clipboardData?.getData("text") ?? ""
  if (pasted != "") {
    registerPaste(pasted)
  }
})

const actualpowerbtn = document.getElementById("actualpowerbtn")
if (actualpowerbtn) {
  actualpowerbtn.onclick = () => {
    location.reload();
  }
}

start()