
const storage = {
    deadnames: [], 
    chosenname: {first: "", last:"", middle: "", honorific: ""},
    substitutions: [],
    count: 0,
    changeInputs: false,
    constantUpdates: false,
    useHighlight: false,
    validURLRegex: "",
    validURLList: "",
    useBlacklist: false,
    useRegex: false,
    enabled: true,
    highlightPattern: '',
    stylesheet: ``
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
function fixText(text, substitutions) {
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
function fixTextUsingElements(text, pattern="${name}", substitutions) {
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
        return false
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
            const fixed = fixText(element.value, substitutions.flat())
            if (fixed !== element.value) {
                changed = true
                element.value = fixed
            }
        }
    }
    if (!(storage.changeInputs && containsInput)) {
        substitutions = [...substitutions]
        for (let i = 0; i < substitutions.length; i++) {
            if (html.match(substitutions[i][substitutions[i].length-1][0]) === null) {
                substitutions.splice(i, 1)
                i--
            }
        }
        if (substitutions.length == 0) {
            return false
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
            const fixed = fixText(element.attributes[at].value, substitutions.flat())
            if (fixed !== element.attributes[at].value) {
                changed = true
                element.attributes[at].value = fixed
            }
        }
    }

    // do children
    let child = element.firstChild
    while (child) {
        changed ||= fixNode(child, substitutions)
        child = child.nextSibling
    }
    return changed
}
function fixNode(node, substitutions = regexedSubs) {
    if (node.nodeType == Node.TEXT_NODE) {
        if (storage.useHighlight) {
            const fixed = fixTextUsingElements(node.data, storage.highlightPattern, substitutions.flat())
            if (fixed[0] !== node.data) {
                changed = true
                node.after(...fixed)
                let original = node
                for (let i = 0; i < fixed.length; i++) {
                    node = node.nextSibling
                }
                original.remove()
            }
        } else {
            const fixed = fixText(node.data, substitutions.flat())
            if (fixed !== node.data) {
                changed = true
                node.data = fixed
            }
        }
    }
    return fixElement(node, substitutions)
}
function fixTitle() {
    const fixed = fixText(document.title, regexedSubs.flat())
    if (fixed != document.title) {
        document.title = fixed
    }
}
function fixDocument() {
    let changed = fixElement(document.body)
    fixTitle()
    saveStorage()
    return changed
}

// init code
function main () {
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
            const patternSubs = []
            for (let j = 0; j < storage.substitutions[i].length; j++) {
                patternSubs.push([new RegExp(...storage.substitutions[i][j][0]), storage.substitutions[i][j][1]])
            }
            regexedSubs.push(patternSubs)
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
    })
    let constantUpdateInterval
    storageEvent.addListener("constantUpdates", () => {
        if (storage.constantUpdates) {
            constantUpdateInterval = setInterval(fixDocument, 1000)
        } else if (constantUpdateInterval) {
            clearInterval(constantUpdateInterval)
        }
    })
    // observe changes in tree
    new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            if (mutation.type === "characterData") {
                fixNode(mutation.target)
            } else if (mutation.type === "attributes") {
                fixElement(mutation.target.parentElement)
            } else if (mutation.type === "childList") {
                for (let i = 0; i < mutation.addedNodes.length; i++) {
                    fixNode(mutation.addedNodes[i])
                }
            }
        })
        if (mutations.length > 0) {
            saveStorage()
        }
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
                fixTitle()
                saveStorage()
            })
        }).observe(title, {
            childList: true
        })
    }
}

chrome.storage.local.get(["enabled", "validURLRegex", "validURLList", "useBlacklist", "useRegex"]).then(result => {
    if (!result.enabled) {
        return
    }
    if (result.useRegex) {
        // if regex exists and matches the host
        if (result.validURLRegex && !(result.useBlacklist ^ new RegExp("^" + result.validURLRegex + "$").test(document.location.host))) {
            return
        }
    } else {
        // if list exists and the host is in the list (or ends with something in the list)
        if (result.validURLList && !(result.useBlacklist ^ result.validURLList.split(",").some(url => document.location.host.endsWith(url.trim())))) {
            return
        }
    }
    main()
})