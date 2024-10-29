const settings_ids = [
    "from",
    "to"
]

let bad = ["the", "you"]
let good = "fixed"
for (let i = 0; i < bad.length; i++) {
    bad[i] = new RegExp(bad[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "gi")
}
function updateSettingsValue(key,value){
    console.log(`setting ${key} to ${value}`)
    switch (key){
        case "from":
            bad = [value]
            break;
        case "to":
            good = value
            break;
        default:
            console.warn(`Unknown Setting "${key}"`)
    }
}
console.log(settings_ids)
for(const key of settings_ids){
    chrome.storage.local.get(key, (result) => {
        updateSettingsValue(key, result[key])
    })
}

chrome.storage.onChanged.addListener((changes, namespace) => {
    for (let [key, { oldValue, newValue }] of Object.entries(changes)) {
        updateSettingsValue(key, newValue)
    };
});

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
