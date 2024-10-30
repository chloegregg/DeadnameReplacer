
const storage = {
    deadnames: [], 
    chosenname: {first: "", last:"", middle: ""},
    substitutions: [],
    count: 0,
}
const storageEvent = {
    update(property) {
        if (this._listeners[property] === undefined) {
            return
        }
        for (const callback of this._listeners[property]) {
            callback()
        }
    },
    addListener(property, callback) {
        if (property instanceof Array) {
            property.forEach(p => {
                this.addListener(p, callback)
            })
            return
        }
        if (this._listeners[property] === undefined) {
            this._listeners[property] = []
        }
        this._listeners[property].push(callback)
    },
    _listeners: {},
    loaded: false
}

function loadStorage() {
    return chrome.storage.local.get().then(value => {
        Object.assign(storage, value ?? {})
        for (const key of Object.keys(storage)) {
            storageEvent.update(key)
        }
        storageEvent.loaded = true
    })
}
function saveStorage() {
    if (storageEvent.loaded) {
        chrome.storage.local.set(storage)
    }
}
// html tags to avoid changing
const TAG_BLACKLIST = ["script", "style", "link"]
// regex for attributes to avoid changing
const ATTRIBUTE_BLACKLIST = [/on\w+/, /style/, /class/, /href/, /src/, /id/]
// html tags with the `value` property to change
const INPUT_WHITELIST = ["input", "textarea"]

let regexedSubs = []
let localCount = 0

function updateCount() {
    if (!storageEvent.loaded) {
        return
    }
    if (localCount > 0) {
        storage.count += localCount
        localCount = 0
    }
}

// replace text
function fixText(text) {
    for (let i = 0; i < regexedSubs.length; i++) {
        const matches = text.matchAll(regexedSubs[i][0]).toArray().length
        if (matches > 0) {
            text = text.replace(regexedSubs[i][0], regexedSubs[i][1])
        }
        localCount += matches
    }
    updateCount()
    return text
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

function fixDocument() {
    fixElement(document.body)
    fixElement(document.querySelector('title'))
    saveStorage()
}

// init code
(function () {
    if (document.body === null) {
        // iframe from another origin or something
        return
    }

    loadStorage().then(() => {
        chrome.storage.onChanged.addListener((changes, namespace) => {
            for (const [key, { oldValue, newValue }] of Object.entries(changes)) {
                storage[key] = newValue
                storageEvent.update(key)
            }
        })
    })
    storageEvent.addListener("substitutions", () => {
        regexedSubs = []
        for (let i = 0; i < storage.substitutions.length; i++) {
            regexedSubs.push([new RegExp(...storage.substitutions[i][0]), storage.substitutions[i][1]])
        }
        fixElement(document.body)
    })
    storageEvent.addListener("count", updateCount)
    // fix anything that appeared before the script started
    fixDocument()
    const initIntervalID = setInterval(fixDocument)
    window.addEventListener("load", () => {
        clearInterval(initIntervalID)
        fixDocument()
        // setInterval(() => fixElement(document.body), 1000)
    })
    // observe changes in tree
    new MutationObserver(mutations => {
        mutations.forEach(function (mutation) {
            if (fixElement(mutation.target)) {
                // updated element
                saveStorage()
            }
        })
    }).observe(document.body, {
        childList: true,
        attributes: true,
        subtree: true,
        characterData: true
    })
    // observe title
    if (document.querySelector("title")) {
        new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (fixElement(mutation.target)) {
                    // updated element
                    saveStorage()
                }
            })
        }).observe(document.querySelector("title"), {childList: true})
    }
})()
