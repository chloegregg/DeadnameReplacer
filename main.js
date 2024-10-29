
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
document.addEventListener("click", event => {
    console.log(event)
}, true)


// const elements = document.getElementsByName("*")
// elements.forEach(element => {
//     if (["script", "style", "link"].includes(element.tagName)) {
//         return
//     }
//     let text = getText(element)
//     text.replace(/test/g, "fixed")
// })
