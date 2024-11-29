
const storage = {
    deadnames: [], 
    chosenname: {first: "", last:"", middle: ""},
    substitutions: [],
    count: 0,
}
let currentSavedStorage = {}
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
        const updated = {}
        for (const key of Object.keys(storage)) {
            if (storage[key] !== currentSavedStorage[key]) {
                updated[key] = currentSavedStorage[key] = storage[key]
            }
        }
        chrome.storage.local.set(updated)
    }
}
// html tags to avoid changing
const TAG_BLACKLIST = ["script", "style", "link"]
// regex for attributes to avoid changing
const ATTRIBUTE_BLACKLIST = [/on\w+/, /style/, /class/, /href/, /src/, /id/]
// html tags with the `value` property to change
const INPUT_WHITELIST = ["input", "textarea"]
// substitutions after creating actual RegExp objects
let regexedSubs = []
// keeps track of the counter, before the link to storage is made, so we don't lose any
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
function fixText(text, substitutions = regexedSubs) {
    for (let i = 0; i < substitutions.length; i++) {
        const matches = text.matchAll(substitutions[i][0]).toArray()
        if (matches.length > 0) {
            text = text.replace(substitutions[i][0], substitutions[i][1])
        }
        localCount += matches.length
    }
    updateCount()
    return text
}
function fixTextUsingElements(text, pattern="${name}", substitutions = regexedSubs) {
    const nodes = [text]
    for (let i = 0; i < substitutions.length; i++) {
        let nodeIndex = 0 // nodeIndex is always even to capture text nodes
        while (nodeIndex < nodes.length) {
            const node = nodes[nodeIndex]
            const matches = node.matchAll(substitutions[i][0]).toArray()
            const inserted = []
            let lastIndex = 0
            for (let matchIndex = 0; matchIndex < matches.length; matchIndex++) {
                const match = matches[matchIndex]
                const fixed = match[0].replace(substitutions[i][0], substitutions[i][1])
                const innerFixed = fixed.slice(match[1].length, fixed.length - match[match.length-1].length)
                const container = document.createElement("span")
                container.innerHTML = pattern.replace(/\$\{name\}/gi, innerFixed)
                container.className = "dnr-fixed-text"
                inserted.push(node.slice(lastIndex, match.index + match[1].length))
                inserted.push(container)
                lastIndex = match.index + match[0].length - match[match.length-1].length
            }
            inserted.push(node.slice(lastIndex))
            nodes.splice(nodeIndex, 1, ...inserted)
            localCount += matches.length
            nodeIndex += 1 + inserted.length
        }
    }
    updateCount()
    return nodes
}

function fixElement(element, substitutions = regexedSubs) {
    if (element === null || (element.tagName && TAG_BLACKLIST.includes(element.tagName.toLowerCase()))) {
        return false
    }
    const html = element.innerHTML
    if (!html) {
        return
    }
    let changed = false
    let containsInput = false
    if (storage.changeInputs) {
        for (const tag of INPUT_WHITELIST) {
            if (html.includes("<" + tag)) {
                containsInput = true
                break
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
    }
    if (!(storage.changeInputs && containsInput)) {
        substitutions = [...substitutions]
        for (let i = 4; i < substitutions.length; i += 5) {
            if (html.match(substitutions[i][0]) === null) {
                substitutions.splice(i-4, 5)
                i -= 5
            }
        }
        if (substitutions.length == 0) {
            return
        }
    }

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

    // do children
    let child = element.firstChild
    while (child) {
        switch (child.nodeType) {
            case Node.TEXT_NODE:
                if (storage.useHighlight) {
                    const fixed = fixTextUsingElements(child.data, storage.highlightPattern, substitutions)
                    if (fixed[0] !== child.data) {
                        changed = true
                        child.after(...fixed)
                        let original = child
                        for (let i = 0; i < fixed.length; i++) {
                            child = child.nextSibling
                        }
                        original.remove()
                    }
                } else {
                    const fixed = fixText(child.data, substitutions)
                    if (fixed !== child.data) {
                        changed = true
                        child.data = fixed
                    }
                }
                break
            default:
                changed ||= this.fixElement(child, substitutions)
                break
        }
        child = child.nextSibling
    }
    return changed
}

function fixDocument() {
    fixElement(document.body)
    const title = document.querySelector("title")
    if (title) {
        title.innerText = fixText(title.innerText)
    }
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
        fixDocument()
    })
    storageEvent.addListener("count", updateCount)

    const stylesheet = document.createElement("style")
    document.head.appendChild(stylesheet)
    storageEvent.addListener("stylesheet", () => {
        stylesheet.textContent = storage.stylesheet
    })
    // fix anything that appeared before the script started
    fixDocument()
    const initInterval = setInterval(fixDocument)
    window.addEventListener("load", () => {
        clearInterval(initInterval)
        fixDocument()
        if (storage.constantUpdates) {
            setInterval(fixDocument, 1000)
        }
    })
    // observe changes in tree
    new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            fixElement(mutation.target)
            saveStorage()
        })
    }).observe(document.body, {
        childList: true,
        attributes: true,
        subtree: true,
        characterData: true
    })
    // observe title
    if (title = document.querySelector("title")) {
        new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                fixElement(mutation.target)
                saveStorage()
            })
        }).observe(title, {
            childList: true
        })
    }
})()
