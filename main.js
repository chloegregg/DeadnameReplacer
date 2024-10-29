const settings_ids = [
    "deadnames",
    "chosenname"
]

// html tags to avoid changing
const TAG_BLACKLIST = ["script", "style", "link"]
// regex for attributes to avoid changing
const ATTRIBUTE_BLACKLIST = [/on\w+/, /style/, /class/, /href/, /src/, /id/]
// html tags with the `value` property to change
const INPUT_WHITELIST = ["input", "textarea"]

const WORD_CHARS = "a-zA-Z"
const WORD_REGEX = new RegExp(`[${WORD_CHARS}]+`, "g")

let bad = []
let good = {first: "", last:"", middle: ""}
let substitutions = []

// generate substitutions from all `bad` into `good`
function generateSubstitutions() {
    clearSubstitutions()
    for (let i = 0; i < bad.length; i++) {
        addSubstitution([bad[i].first, bad[i].middle, bad[i].last].join(" "), [good.first, good.middle, good.last].join(" "))
        addSubstitution([bad[i].first, bad[i].middle, bad[i].last].join(""), [good.first, good.middle, good.last].join(""))
        addSubstitution([bad[i].first, bad[i].last].join(" "), [good.first, good.last].join(" "))
        addSubstitution([bad[i].first, bad[i].last].join(""), [good.first, good.last].join(""))
        addSubstitution(bad[i].last, good.last)
        addSubstitution(bad[i].first, good.first)
    }
}
// add a substitution
function addSubstitution(bad, good) {
    if (!bad.match(WORD_REGEX) || !good.match(WORD_REGEX)) {
        return
    }
    function titleCase(str) {
        let title = ""
        let lastWord = -1
        for (const word of str.matchAll(WORD_REGEX)) {
            title += str.slice(lastWord+1, word.index).toLowerCase()
            title += str[word.index].toUpperCase()
            lastWord = word.index
        }
        title += str.slice(lastWord+1).toLowerCase()
        return title
    }
    function createRegExpFor(bad, good, flags = "g") {
        let replacement = "$1"
        const words = good.split(" ")
        const badWordCount = bad.split(" ").length
        for (let i = 0; i < words.length; i++) {
            replacement += words[i]
            if (i + 1 == words.length) {
                replacement += "$" + (badWordCount+1)
            } else if (i + 1 >= badWordCount) {
                replacement += " "
            } else {
                replacement += "$" + (i+2)
            }
        }
        for (let i = words.length; i < badWordCount.length; i++) {
            replacement += "$" + (i+2)
        }
        return [new RegExp(`([^${WORD_CHARS}]|^)${bad.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, `([^${WORD_CHARS}]+)`)}([^${WORD_CHARS}]|$)`, flags), replacement]
    }
    substitutions.push(createRegExpFor(bad.toLowerCase(), good.toLowerCase()))
    substitutions.push(createRegExpFor(bad.toUpperCase(), good.toUpperCase()))
    if (bad.length > 0 && good.length > 0) {
        // Single title case
        substitutions.push(createRegExpFor(bad[0].toUpperCase()+bad.slice(1).toLowerCase(), good[0].toUpperCase()+good.slice(1).toLowerCase()))
        // Title Case
        substitutions.push(createRegExpFor(titleCase(bad), titleCase(good)))
        
    }
    // any other case
    substitutions.push(createRegExpFor(bad, good, "gi"))
}
// remove all substitutions
function clearSubstitutions() {
    substitutions = []
}
// replace text
function fixText(text) {
    for (let i = 0; i < substitutions.length; i++) {
        if (text.match(substitutions[i][0]) !== null) {
            text = text.replace(substitutions[i][0], substitutions[i][1])
        }
    }
    return text
}
// update settings
function updateSettingsValue(key, value) {
    switch (key) {
        case "deadnames":
            bad = value
            generateSubstitutions()
            break;
        case "chosenname":
            good = value
            generateSubstitutions()
            break;
        default:
            console.warn(`Unknown Setting "${key}"`)
    }
}

function fixElement(element) {
    if (element.tagName && TAG_BLACKLIST.includes(element.tagName.toLowerCase())) {
        return false
    }
    let changed = false

    // change attributes
    if (element.attributes !== undefined) {
        attrs: for (const at of Object.keys(element.attributes)) {
            if (element.attributes[at] === undefined) {
                continue attrs
            }
            for (const attrRegex of ATTRIBUTE_BLACKLIST) {
                if (at.match(attrRegex) !== null) {
                    continue attrs
                }
            }
            const fixed = fixText(element.attributes[at].value)
            if (fixed !== element.attributes[at].value) {
                changed = true
                element.attributes[at].value = fixed
            }

        }
    }
    // change input values
    if (element.tagName && INPUT_WHITELIST.includes(element.tagName.toLowerCase())) {
        const fixed = fixText(element.value)
        if (fixed !== element.value) {
            changed = true
            element.value = fixed
        }
    }

    // do children
    let child = element.firstChild
    while (child) {
        switch (child.nodeType) {
            case Node.TEXT_NODE:
                const fixed = fixText(child.data)
                if (fixed !== child.data) {
                    changed = true
                    child.data = fixed
                }
                break
            default:
                changed ||= this.fixElement(child)
                break
        }
        child = child.nextSibling
    }
    return changed
}

// init code
(function () {
    // load settings
    for (const key of settings_ids) {
        chrome.storage.local.get(key, result => {
            updateSettingsValue(key, result[key])
        })
    }
    // listen for setting changes
    chrome.storage.onChanged.addListener((changes, namespace) => {
        for (const [key, { oldValue, newValue }] of Object.entries(changes)) {
            updateSettingsValue(key, newValue)
        }
    })
    // fix anything that appeared before the script started
    const initIntervalID = setInterval(()=>fixElement(document.body))
    window.addEventListener("load", () => {
        fixElement(document.body)
        clearInterval(initIntervalID)
        setInterval(()=>fixElement(document.body), 1000)
    })
    // observe changes in tree
    new MutationObserver(mutations => {
        mutations.forEach(function (mutation) {
            if (fixElement(mutation.target)) {
                // updated element
            }
        })
    }).observe(document.body, {
        childList: true,
        attributes: true,
        subtree: true,
        characterData: true
    })
})()

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
