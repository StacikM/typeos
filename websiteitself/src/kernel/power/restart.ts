import { printf } from "../../terminal";

export default function restart() {
    printf("Rebooting");
    setTimeout(() => {
        location.reload();
    }, 1000);
}