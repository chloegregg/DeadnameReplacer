const settings_ids = [
    "substitutions"
]
// html tags to avoid changing
const TAG_BLACKLIST = ["script", "style", "link"]
// regex for attributes to avoid changing
const ATTRIBUTE_BLACKLIST = [/on\w+/, /style/, /class/, /href/, /src/, /id/]
// html tags with the `value` property to change
const INPUT_WHITELIST = ["input", "textarea"]

let substitutions = []

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
        case "substitutions":
            substitutions = []
            for (let i = 0; i < value.length; i++) {
                substitutions.push([new RegExp(...value[i][0]), value[i][1]])
            }
            fixElement(document.body)
            break;
        default:
            console.warn(`Unknown Setting "${key}"`)
    }
}

function fixElement(element) {
    if (element === null || (element.tagName && TAG_BLACKLIST.includes(element.tagName.toLowerCase()))) {
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
