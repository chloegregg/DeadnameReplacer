
let bad = ["the", "you"]
let good = "fixed"
for (let i = 0; i < bad.length; i++) {
    bad[i] = new RegExp(bad[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "gi")
}
function fixElement(element) {
    if (element.tagName && ["script", "style", "link"].includes(element.tagName.toLowerCase())) {
        return
    }
    let child = element.firstChild
    while (child) {
        if (child.nodeType == Node.TEXT_NODE) {
            for (let i = 0; i < bad.length; i++) {
                child.data = child.data.replace(bad[i], good)
            }
        } else {
            this.fixElement(child)
        }
        child = child.nextSibling
    }
}
console.log("start")
// setTimeout(()=>fixElement(document.body), 1000)
const id = setInterval(() => {
    fixElement(document.body)
    console.log("fixx")
}, 10)
// window.addEventListener('load', function () {
//     fixElement(document.body)
//     clearInterval(id)
// })
// document.addEventListener("click", event => {
//     console.log(event.target)
//     fixElement(event.target)
// }, true)

// // https://stackoverflow.com/a/5379408
// function getSelectionText() {
//     let text = "";
//     const activeEl = document.activeElement;
//     const activeElTagName = activeEl ? activeEl.tagName.toLowerCase() : null;

//     if (
//         (activeElTagName == "textarea") || (activeElTagName == "input" &&
//             /^(?:text|search|password|tel|url)$/i.test(activeEl.type)) &&
//         (typeof activeEl.selectionStart == "number")
//     ) {
//         text = activeEl.value.slice(activeEl.selectionStart, activeEl.selectionEnd);
//     } else if (window.getSelection) {
//         text = window.getSelection().toString();
//     }

//     return text;
// }

// const elements = document.getElementsByName("*")
// elements.forEach(element => {
//     if (["script", "style", "link"].includes(element.tagName)) {
//         return
//     }
//     let text = getText(element)
//     text.replace(/test/g, "fixed")
// })
